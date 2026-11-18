"""记账品类：每个用户独立维护，支持 emoji 与颜色。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import Category, Transaction, User
from ..schemas import CategoryIn, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def _serialize(category: Category, usage: int = 0) -> dict:
    data = CategoryOut.model_validate(category).model_dump()
    data["usage"] = usage
    return data


@router.get("", summary="品类列表（含使用次数）")
def list_categories(
    kind: str | None = None,
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    statement = select(Category).where(Category.user_id == user.id)
    if kind:
        statement = statement.where(Category.kind == kind)
    if not include_archived:
        statement = statement.where(Category.is_archived.is_(False))
    categories = db.scalars(statement.order_by(Category.sort_order, Category.id)).all()

    usage_rows = db.execute(
        select(Transaction.category_id, func.count(Transaction.id))
        .where(Transaction.user_id == user.id)
        .group_by(Transaction.category_id)
    ).all()
    usage = {row[0]: int(row[1]) for row in usage_rows}
    return [_serialize(category, usage.get(category.id, 0)) for category in categories]


@router.post("", summary="新增品类")
def create_category(
    payload: CategoryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    exists = db.scalar(
        select(Category.id).where(
            Category.user_id == user.id,
            Category.name == payload.name.strip(),
            Category.kind == payload.kind,
        )
    )
    if exists:
        raise HTTPException(status_code=409, detail="同类型下已存在同名品类")
    with WRITE_LOCK:
        category = Category(
            user_id=user.id,
            name=payload.name.strip(),
            emoji=payload.emoji or "📦",
            kind=payload.kind,
            color=payload.color,
            sort_order=payload.sort_order,
        )
        db.add(category)
        db.commit()
        db.refresh(category)
    return _serialize(category)


@router.patch("/{category_id}", summary="更新品类")
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="品类不存在")
    with WRITE_LOCK:
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(category, field, value.strip() if isinstance(value, str) else value)
        db.add(category)
        db.commit()
    return _serialize(category)


@router.delete("/{category_id}", summary="删除品类（有流水时自动归档）")
def delete_category(
    category_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="品类不存在")
    used = db.scalar(
        select(func.count(Transaction.id)).where(
            Transaction.user_id == user.id, Transaction.category_id == category_id
        )
    )
    with WRITE_LOCK:
        if used:
            category.is_archived = True
            db.add(category)
            db.commit()
            return {"archived": True, "message": "该品类已有流水，已归档以保留历史记录"}
        db.delete(category)
        db.commit()
    return {"archived": False, "message": "品类已删除"}


@router.post("/{category_id}/restore", summary="恢复已归档品类")
def restore_category(
    category_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="品类不存在")
    with WRITE_LOCK:
        category.is_archived = False
        db.add(category)
        db.commit()
    return {"ok": True, "message": "品类已恢复"}
