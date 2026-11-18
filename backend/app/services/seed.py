"""初始化数据：仅创建初始账号与其默认品类，不生成任何流水/预算。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DEFAULT_CATEGORIES, SEED_PASSWORD, SEED_USERNAME
from ..models import Category, User
from ..security import hash_password


def ensure_seed(db: Session) -> User:
    user = db.scalar(select(User).where(User.username == SEED_USERNAME))
    if user is None:
        user = User(
            username=SEED_USERNAME,
            password_hash=hash_password(SEED_PASSWORD),
            display_name="Chan",
            role="admin",
            avatar_emoji="🐳",
            currency="CNY",
        )
        db.add(user)
        db.flush()

    has_category = db.scalar(select(Category.id).where(Category.user_id == user.id).limit(1))
    if has_category is None:
        for index, item in enumerate(DEFAULT_CATEGORIES):
            db.add(Category(user_id=user.id, sort_order=index, **item))
    db.commit()
    return user
