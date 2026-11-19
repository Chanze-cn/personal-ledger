"""初始化数据：按当前注册的账号铺一套两级默认品类，不生成任何流水/预算。

系统不预置任何账号，所有初始化数据都在账号注册成功时绑定到该账号。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DEFAULT_CATEGORIES
from ..models import Category


def ensure_default_categories(db: Session, user_id: int) -> None:
    """为账号铺一套两级默认品类，并补齐缺失的子品类。

    只处理「名称 + 收支类型」与系统默认一致的一级品类，用户自定义品类不会被改动；
    已存在的同名子品类也会跳过，可安全重复执行。
    """
    categories = db.scalars(select(Category).where(Category.user_id == user_id)).all()
    top: dict[tuple[str, str], Category] = {
        (item.name, item.kind): item for item in categories if item.parent_id is None
    }
    children: dict[int, set[str]] = {}
    for item in categories:
        if item.parent_id:
            children.setdefault(item.parent_id, set()).add(item.name)

    for index, item in enumerate(DEFAULT_CATEGORIES):
        parent = top.get((item["name"], item["kind"]))
        if parent is None:
            parent = Category(
                user_id=user_id,
                name=item["name"],
                emoji=item["emoji"],
                kind=item["kind"],
                color=item["color"],
                sort_order=index,
            )
            db.add(parent)
            db.flush()
            top[(item["name"], item["kind"])] = parent

        existing_children = children.setdefault(parent.id, set())
        for child_index, child in enumerate(item.get("children", [])):
            if child["name"] in existing_children:
                continue
            db.add(
                Category(
                    user_id=user_id,
                    parent_id=parent.id,
                    name=child["name"],
                    emoji=child["emoji"],
                    kind=item["kind"],
                    color=item["color"],
                    sort_order=child_index,
                )
            )
            existing_children.add(child["name"])
