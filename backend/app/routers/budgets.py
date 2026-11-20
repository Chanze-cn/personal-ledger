"""预算：总预算 + 品类子预算的两级结构。

规则：
1. 总预算（category_id 为空、parent_id 为空）可以挂多个品类子预算；
2. 子预算的周期强制继承父预算，保证执行窗口一致；
3. 总预算的生效额度 = max(自身额度, 子预算额度合计)。
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import Budget, Category, User
from ..schemas import BudgetIn, BudgetUpdate
from ..services.budgets import list_budget_groups, serialize_budget
from ..clock import today as local_today

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _get_category(db: Session, user: User, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=400, detail="品类不存在")
    return category


def _get_parent(db: Session, user: User, parent_id: int | None) -> Budget | None:
    if parent_id is None:
        return None
    parent = db.get(Budget, parent_id)
    if parent is None or parent.user_id != user.id:
        raise HTTPException(status_code=400, detail="父级预算不存在")
    if parent.parent_id is not None or parent.category_id is not None:
        raise HTTPException(status_code=400, detail="只有总预算可以挂子预算")
    return parent


def _ensure_unique_child(
    db: Session, user: User, parent_id: int, category_id: int, exclude_id: int | None = None
) -> None:
    statement = select(Budget.id).where(
        Budget.user_id == user.id,
        Budget.parent_id == parent_id,
        Budget.category_id == category_id,
    )
    if exclude_id is not None:
        statement = statement.where(Budget.id != exclude_id)
    if db.scalar(statement):
        raise HTTPException(status_code=409, detail="该总预算下已存在这个品类的子预算")


@router.get("", summary="预算列表（总预算 + 子预算 + 独立预算）")
def get_budgets(
    kind: str | None = Query(default=None, pattern="^(expense|income)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return list_budget_groups(db, user.id, kind)


@router.post("", summary="新增预算")
def create_budget(
    payload: BudgetIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = _get_category(db, user, payload.category_id)
    parent = _get_parent(db, user, payload.parent_id)

    if parent is not None:
        if category is None:
            raise HTTPException(status_code=400, detail="品类子预算必须指定品类")
        if category.kind != parent.kind:
            raise HTTPException(status_code=400, detail="子预算的收支类型必须与总预算一致")
        _ensure_unique_child(db, user, parent.id, category.id)
        period_type = parent.period_type
        period_days = parent.period_days
        anchor_date = parent.anchor_date
        kind = parent.kind
    else:
        period_type = payload.period_type
        period_days = payload.period_days if payload.period_type == "custom" else None
        anchor_date = payload.anchor_date or local_today()
        kind = category.kind if category is not None else payload.kind

    if period_type == "custom" and not period_days:
        raise HTTPException(status_code=400, detail="自定义周期需要填写天数")

    with WRITE_LOCK:
        budget = Budget(
            user_id=user.id,
            parent_id=parent.id if parent else None,
            name=payload.name.strip(),
            category_id=category.id if category else None,
            kind=kind,
            period_type=period_type,
            period_days=period_days,
            anchor_date=anchor_date,
            amount_cents=int(round(payload.amount * 100)),
            is_active=True,
        )
        db.add(budget)
        db.commit()
        db.refresh(budget)

    return serialize_budget(db, budget, category)


@router.patch("/{budget_id}", summary="更新预算")
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="预算不存在")

    children = list(
        db.scalars(select(Budget).where(Budget.parent_id == budget.id)).all()
    )
    fields = payload.model_fields_set
    current_parent = db.get(Budget, budget.parent_id) if budget.parent_id else None
    requested_category = (
        _get_category(db, user, payload.category_id)
        if "category_id" in fields and payload.category_id is not None
        else (None if "category_id" in fields else db.get(Category, budget.category_id))
    )
    requested_parent = (
        _get_parent(db, user, payload.parent_id)
        if "parent_id" in fields
        else current_parent
    )

    # A total budget with children cannot be converted into a category budget;
    # doing so would orphan the existing child budgets.
    changing_shape = (
        (requested_parent.id if requested_parent else None)
        != (current_parent.id if current_parent else None)
        or (requested_category.id if requested_category else None)
        != budget.category_id
    )
    if children and changing_shape:
        raise HTTPException(status_code=400, detail="该总预算下已有子预算，请先删除子预算再修改归属")
    if requested_parent is not None:
        if requested_category is None:
            raise HTTPException(status_code=400, detail="品类子预算必须指定品类")
        if requested_category.kind != requested_parent.kind:
            raise HTTPException(status_code=400, detail="子预算的收支类型必须与总预算一致")
        _ensure_unique_child(db, user, requested_parent.id, requested_category.id, budget.id)

    with WRITE_LOCK:
        budget.parent_id = requested_parent.id if requested_parent else None
        budget.category_id = requested_category.id if requested_category else None
        if payload.name is not None:
            budget.name = payload.name.strip()
        if payload.amount is not None:
            budget.amount_cents = int(round(payload.amount * 100))
        if payload.is_active is not None:
            budget.is_active = payload.is_active

        if budget.parent_id is not None:
            # Child budgets always inherit their parent window and kind.
            budget.period_type = requested_parent.period_type
            budget.period_days = requested_parent.period_days
            budget.anchor_date = requested_parent.anchor_date
            budget.kind = requested_parent.kind
        elif budget.category_id is None:
            # 总预算：周期改动需要同步到所有子预算
            if payload.period_type and payload.period_type != budget.period_type:
                if children:
                    raise HTTPException(
                        status_code=400, detail="该总预算下已有子预算，请先清空子预算再改周期"
                    )
                budget.period_type = payload.period_type
            if payload.period_type == "custom" or budget.period_type == "custom":
                if payload.period_days is not None:
                    budget.period_days = payload.period_days
                elif budget.period_type != "custom":
                    budget.period_days = None
            elif payload.period_type is not None:
                budget.period_days = None
            if payload.anchor_date is not None:
                budget.anchor_date = payload.anchor_date
        else:
            # 子预算 / 独立品类预算：周期可改（子预算在下方同步给父级约束外的场景直接拒绝）
            if payload.period_type is not None:
                budget.period_type = payload.period_type
            if budget.period_type == "custom":
                if payload.period_days is not None:
                    budget.period_days = payload.period_days
                elif not budget.period_days:
                    raise HTTPException(status_code=400, detail="自定义周期需要填写天数")
            else:
                budget.period_days = None
            if payload.anchor_date is not None:
                budget.anchor_date = payload.anchor_date

        if budget.category_id is not None and budget.parent_id is None:
            budget.kind = requested_category.kind
        elif payload.kind is not None and budget.category_id is None and not children:
            budget.kind = payload.kind

        db.add(budget)
        db.commit()
        db.refresh(budget)

    return serialize_budget(db, budget, requested_category)


@router.delete("/{budget_id}", summary="删除预算（总预算会级联删除子预算）")
def delete_budget(
    budget_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    budget = db.get(Budget, budget_id)
    if budget is None or budget.user_id != user.id:
        raise HTTPException(status_code=404, detail="预算不存在")
    with WRITE_LOCK:
        children = list(db.scalars(select(Budget).where(Budget.parent_id == budget.id)).all())
        for child in children:
            db.delete(child)
        db.delete(budget)
        db.commit()
    return {"ok": True, "removed_children": len(children)}
