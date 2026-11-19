"""记账品类：支持两级（一级分组 + 二级末级），每个用户独立维护。

只有没有子品类的末级品类可以被流水引用；一级品类的使用次数按「自身 + 全部子品类」汇总。
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import Category, Transaction, User
from ..schemas import CategoryIn, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def _serialize(
    category: Category, usage: int = 0, child_count: int = 0
) -> dict:
    data = CategoryOut.model_validate(category).model_dump()
    data["usage"] = usage
    data["child_count"] = child_count
    data["is_leaf"] = child_count == 0
    return data


def _sibling_filter(parent_id: int | None):
    return Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id


@router.get("", summary="品类列表（两级，含使用次数）")
def list_categories(
    kind: str | None = None,
    include_archived: bool = False,
    tree: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.sort_order, Category.id)
    ).all()

    usage_rows = db.execute(
        select(Transaction.category_id, func.count(Transaction.id))
        .where(Transaction.user_id == user.id)
        .group_by(Transaction.category_id)
    ).all()
    usage = {row[0]: int(row[1]) for row in usage_rows}

    children_map: dict[int, list[Category]] = defaultdict(list)
    for category in rows:
        if category.parent_id is not None:
            children_map[category.parent_id].append(category)

    def total_usage(category: Category) -> int:
        """一级品类统计自身与全部子品类的流水条数。"""
        own = usage.get(category.id, 0)
        return own + sum(usage.get(child.id, 0) for child in children_map.get(category.id, []))

    visible = [
        category
        for category in rows
        if (include_archived or not category.is_archived)
        and (kind is None or category.kind == kind)
    ]

    if not tree:
        return [
            _serialize(
                category,
                total_usage(category) if category.parent_id is None else usage.get(category.id, 0),
                len(children_map.get(category.id, [])),
            )
            for category in visible
        ]

    visible_ids = {category.id for category in visible}
    result = []
    for category in visible:
        if category.parent_id is not None:
            continue
        children = [child for child in children_map.get(category.id, []) if child.id in visible_ids]
        data = _serialize(category, total_usage(category), len(children))
        data["children"] = [_serialize(child, usage.get(child.id, 0), 0) for child in children]
        result.append(data)
    return result


@router.post("", summary="新增品类（parent_id 为空即一级品类）")
def create_category(
    payload: CategoryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="品类名称不能为空")

    kind = payload.kind
    if payload.parent_id is not None:
        parent = db.get(Category, payload.parent_id)
        if parent is None or parent.user_id != user.id:
            raise HTTPException(status_code=404, detail="父品类不存在")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="品类最多两级，子品类下不能再建子品类")
        kind = parent.kind

    exists = db.scalar(
        select(Category.id).where(
            Category.user_id == user.id,
            _sibling_filter(payload.parent_id),
            Category.name == name,
            Category.kind == kind,
        )
    )
    if exists:
        raise HTTPException(status_code=409, detail="同一层级下已存在同名品类")

    with WRITE_LOCK:
        max_sort = db.scalar(
            select(func.max(Category.sort_order)).where(
                Category.user_id == user.id, _sibling_filter(payload.parent_id)
            )
        )
        category = Category(
            user_id=user.id,
            parent_id=payload.parent_id,
            name=name,
            emoji=payload.emoji or "📦",
            kind=kind,
            color=payload.color,
            sort_order=payload.sort_order or int(max_sort or 0) + 1,
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

    values = payload.model_dump(exclude_none=True)
    new_name = values.get("name")
    if new_name is not None:
        new_name = new_name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="品类名称不能为空")
        duplicated = db.scalar(
            select(Category.id).where(
                Category.user_id == user.id,
                _sibling_filter(category.parent_id),
                Category.name == new_name,
                Category.kind == category.kind,
                Category.id != category.id,
            )
        )
        if duplicated:
            raise HTTPException(status_code=409, detail="同一层级下已存在同名品类")

    with WRITE_LOCK:
        for field, value in values.items():
            setattr(category, field, value.strip() if isinstance(value, str) else value)
        db.add(category)
        db.commit()
    children = db.scalar(
        select(func.count(Category.id)).where(
            Category.user_id == user.id, Category.parent_id == category.id
        )
    )
    return _serialize(category, child_count=int(children or 0))


@router.delete("/{category_id}", summary="删除品类（有子品类则拒绝，有流水则归档）")
def delete_category(
    category_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    category = db.get(Category, category_id)
    if category is None or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="品类不存在")

    child_count = db.scalar(
        select(func.count(Category.id)).where(
            Category.user_id == user.id, Category.parent_id == category_id
        )
    )
    if int(child_count or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"该品类下还有 {int(child_count or 0)} 个子品类，请先删除或归档子品类",
        )

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
