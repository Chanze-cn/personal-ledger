"""数据模型。

核心思想：`transactions` 是唯一事实来源（source of truth），
`rollup_daily` / `rollup_period` 是由流水派生出的统计切片，任何时刻都可重建。
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .clock import now as local_now


def now() -> dt.datetime:
    return local_now()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(64), default="")
    role: Mapped[str] = mapped_column(String(16), default="user")  # admin / user
    avatar_emoji: Mapped[str] = mapped_column(String(8), default="🐳")
    currency: Mapped[str] = mapped_column(String(8), default="CNY")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

    categories: Mapped[list["Category"]] = relationship(back_populates="user")


class AuthNonce(Base):
    """登录握手的一次性随机串，用完即删，用于防重放。"""

    __tablename__ = "auth_nonces"

    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)


class Category(Base):
    """记账品类，最多两级：一级品类 `parent_id` 为空，二级品类挂在一级下。

    只有「没有子品类」的末级品类可以被流水引用；父品类仅用于分组、统计聚合与预算。
    """

    __tablename__ = "categories"
    __table_args__ = (Index("ix_category_user_parent", "user_id", "parent_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(32))
    emoji: Mapped[str] = mapped_column(String(8), default="📦")
    kind: Mapped[str] = mapped_column(String(8), default="expense")  # expense / income
    color: Mapped[str] = mapped_column(String(16), default="#94A3B8")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

    user: Mapped[User] = relationship(back_populates="categories")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side=[id]
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_txn_user_date", "user_id", "occurred_on"),
        Index("ix_txn_user_category", "user_id", "category_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    kind: Mapped[str] = mapped_column(String(8), default="expense")
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    occurred_on: Mapped[dt.date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)

    category: Mapped[Category] = relationship(lazy="joined")


class RecurringTransaction(Base):
    """周期流水模板；生成记录单独保存以保证重复执行幂等。"""

    __tablename__ = "recurring_transactions"
    __table_args__ = (Index("ix_recurring_user_next", "user_id", "is_active", "next_run_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    kind: Mapped[str] = mapped_column(String(8))
    amount_cents: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(255), default="")
    frequency: Mapped[str] = mapped_column(String(16))  # daily/weekly/monthly/yearly
    next_run_on: Mapped[dt.date] = mapped_column(Date, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)

    category: Mapped[Category] = relationship(lazy="joined")


class RecurringOccurrence(Base):
    __tablename__ = "recurring_occurrences"
    __table_args__ = (UniqueConstraint("template_id", "occurred_on", name="uq_recurring_occurrence"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("recurring_transactions.id", ondelete="CASCADE"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), unique=True)
    occurred_on: Mapped[dt.date] = mapped_column(Date)


class RollupDaily(Base):
    """日切片：每个用户、每天、每个品类、每个收支方向的聚合。"""

    __tablename__ = "rollup_daily"
    __table_args__ = (
        UniqueConstraint("user_id", "stat_date", "category_id", "kind", name="uq_rollup_daily_key"),
        Index("ix_rollup_daily_user_date", "user_id", "stat_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stat_date: Mapped[dt.date] = mapped_column(Date)
    category_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(8))
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    txn_count: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)


class RollupPeriod(Base):
    """周 / 月 / 年切片，供报表直接读取，避免重复聚合。"""

    __tablename__ = "rollup_period"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "granularity",
            "period_start",
            "category_id",
            "kind",
            name="uq_rollup_period_key",
        ),
        Index("ix_rollup_period_user_gran", "user_id", "granularity", "period_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    granularity: Mapped[str] = mapped_column(String(8))  # week / month / year
    period_start: Mapped[dt.date] = mapped_column(Date)
    period_end: Mapped[dt.date] = mapped_column(Date)
    category_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(8))
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    txn_count: Mapped[int] = mapped_column(Integer, default=0)
    computed_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Budget(Base):
    """预算定义。

    层级约定：
    - 总预算：`category_id is null` 且 `parent_id is null`
    - 品类子预算：`parent_id` 指向总预算，`category_id` 必填
    - 独立品类预算：`parent_id is null` 且 `category_id` 非空
    """

    __tablename__ = "budgets"
    __table_args__ = (Index("ix_budget_user_parent", "user_id", "parent_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(64), default="")
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(8), default="expense")  # expense / income
    period_type: Mapped[str] = mapped_column(String(16), default="month")  # day/week/month/year/custom
    period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anchor_date: Mapped[dt.date] = mapped_column(Date, default=dt.date.today)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


class JobRun(Base):
    """异步任务运行记录，用于任务中心的运营观测。"""

    __tablename__ = "job_runs"
    __table_args__ = (Index("ix_job_runs_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    job_type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending/running/success/failed
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    trigger: Mapped[str] = mapped_column(String(16), default="manual")  # manual/schedule/system
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
