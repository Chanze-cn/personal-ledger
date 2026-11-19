"""记账流水。任何写操作都会触发一次从受影响日期开始的异步切片重算。"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import Category, Transaction, User
from ..schemas import (
    MutationResult,
    TransactionIn,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
)
from ..services.jobs import patch_rollup_job
from ..services.stats import to_yuan

router = APIRouter(prefix="/transactions", tags=["transactions"])


def serialize_transaction(txn: Transaction) -> TransactionOut:
    category = txn.category
    parent = category.parent if category else None
    return TransactionOut(
        id=txn.id,
        category_id=txn.category_id,
        category_name=category.name if category else "已删除品类",
        category_parent_name=parent.name if parent else None,
        category_emoji=category.emoji if category else "❓",
        category_color=category.color if category else "#94A3B8",
        kind=txn.kind,
        amount=to_yuan(txn.amount_cents),
        occurred_on=txn.occurred_on,
        note=txn.note or "",
        created_at=txn.created_at,
    )


def _resolve_category(db: Session, user: User, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=400, detail="品类不存在")
    return category


def _resolve_leaf_category(db: Session, user: User, category_id: int) -> Category:
    """流水只能记到末级品类：父品类下还有子品类时拒绝。"""
    category = _resolve_category(db, user, category_id)
    if category.is_archived:
        raise HTTPException(status_code=400, detail="该品类已归档，请选择其他品类")
    has_child = db.scalar(
        select(Category.id)
        .where(
            Category.user_id == user.id,
            Category.parent_id == category.id,
            Category.is_archived.is_(False),
        )
        .limit(1)
    )
    if has_child is not None:
        raise HTTPException(status_code=400, detail="该品类下还有子品类，请选择具体子品类")
    return category


@router.get("", response_model=TransactionPage, summary="流水列表（分页筛选）")
def list_transactions(
    start: dt.date | None = None,
    end: dt.date | None = None,
    kind: str | None = None,
    category_id: int | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionPage:
    conditions = [Transaction.user_id == user.id]
    if start:
        conditions.append(Transaction.occurred_on >= start)
    if end:
        conditions.append(Transaction.occurred_on <= end)
    if kind in {"expense", "income"}:
        conditions.append(Transaction.kind == kind)
    if category_id:
        # 选一级品类时包含其全部子品类，符合「父级 = 整组」的直觉
        child_ids = db.scalars(
            select(Category.id).where(
                Category.user_id == user.id,
                Category.parent_id == category_id,
            )
        ).all()
        conditions.append(Transaction.category_id.in_([category_id, *child_ids]))
    if q:
        conditions.append(Transaction.note.like(f"%{q.strip()}%"))

    total = db.scalar(select(func.count(Transaction.id)).where(*conditions)) or 0

    agg = db.execute(
        select(Transaction.kind, func.sum(Transaction.amount_cents))
        .where(*conditions)
        .group_by(Transaction.kind)
    ).all()
    sums = {row[0]: int(row[1] or 0) for row in agg}

    rows = db.scalars(
        select(Transaction)
        .where(*conditions)
        .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return TransactionPage(
        items=[serialize_transaction(row) for row in rows],
        total=int(total),
        page=page,
        page_size=page_size,
        total_expense=to_yuan(sums.get("expense", 0)),
        total_income=to_yuan(sums.get("income", 0)),
    )


@router.post("", response_model=MutationResult, summary="记一笔（异步更新切片）")
def create_transaction(
    payload: TransactionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MutationResult:
    category = _resolve_leaf_category(db, user, payload.category_id)
    with WRITE_LOCK:
        txn = Transaction(
            user_id=user.id,
            category_id=category.id,
            kind=category.kind,
            amount_cents=int(round(payload.amount * 100)),
            occurred_on=payload.occurred_on,
            note=payload.note.strip(),
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)

    job_id = patch_rollup_job(
        user.id, payload.occurred_on, f"{category.emoji} {category.name}", txn.id
    )
    return MutationResult(
        job_id=job_id, message="已记账，正在重算切片", transaction=serialize_transaction(txn)
    )


@router.patch("/{transaction_id}", response_model=MutationResult, summary="编辑流水（重算受影响区间）")
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MutationResult:
    txn = db.get(Transaction, transaction_id)
    if txn is None or txn.user_id != user.id:
        raise HTTPException(status_code=404, detail="流水不存在")

    old_date = txn.occurred_on
    with WRITE_LOCK:
        if payload.category_id is not None:
            category = _resolve_leaf_category(db, user, payload.category_id)
            txn.category_id = category.id
            txn.kind = category.kind
        if payload.amount is not None:
            txn.amount_cents = int(round(payload.amount * 100))
        if payload.occurred_on is not None:
            txn.occurred_on = payload.occurred_on
        if payload.note is not None:
            txn.note = payload.note.strip()
        db.add(txn)
        db.commit()
        db.refresh(txn)

    recalc_from_date = min(old_date, txn.occurred_on)
    job_id = patch_rollup_job(user.id, recalc_from_date, "编辑流水", txn.id)
    return MutationResult(
        job_id=job_id, message="已保存，正在重算切片", transaction=serialize_transaction(txn)
    )


@router.delete("/{transaction_id}", response_model=MutationResult, summary="删除流水（重算受影响区间）")
def delete_transaction(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MutationResult:
    txn = db.get(Transaction, transaction_id)
    if txn is None or txn.user_id != user.id:
        raise HTTPException(status_code=404, detail="流水不存在")
    occurred_on = txn.occurred_on
    with WRITE_LOCK:
        db.delete(txn)
        db.commit()
    job_id = patch_rollup_job(user.id, occurred_on, "删除流水", transaction_id)
    return MutationResult(job_id=job_id, message="已删除，正在重算切片", transaction=None)
