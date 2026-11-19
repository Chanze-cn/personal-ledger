"""Pydantic 数据传输对象。金额统一以「元」在接口层流转，落库为「分」。"""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SealedPayload(BaseModel):
    """混合加密信封：RSA 包裹的会话密钥 + AES-GCM 密文。"""

    key_id: str = Field(min_length=1, max_length=64)
    key: str = Field(min_length=1, max_length=2048)
    iv: str = Field(min_length=1, max_length=64)
    data: str = Field(min_length=1, max_length=100_000)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: str
    avatar_emoji: str
    currency: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    avatar_emoji: str | None = Field(default=None, max_length=8)
    currency: str | None = Field(default=None, max_length=8)


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    emoji: str = Field(default="📦", max_length=8)
    kind: str = Field(default="expense", pattern="^(expense|income)$")
    color: str = Field(default="#94A3B8", max_length=16)
    sort_order: int = 0
    """为空表示一级品类；填写时必须是同账号下的一级品类 id。"""
    parent_id: int | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=32)
    emoji: str | None = Field(default=None, max_length=8)
    color: str | None = Field(default=None, max_length=16)
    sort_order: int | None = None
    is_archived: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    emoji: str
    kind: str
    color: str
    sort_order: int
    is_archived: bool


class TransactionIn(BaseModel):
    category_id: int
    amount: float = Field(gt=0, le=100_000_000)
    occurred_on: dt.date
    note: str = Field(default="", max_length=255)

    @field_validator("amount")
    @classmethod
    def _round_amount(cls, value: float) -> float:
        return round(float(value), 2)


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    amount: float | None = Field(default=None, gt=0, le=100_000_000)
    occurred_on: dt.date | None = None
    note: str | None = Field(default=None, max_length=255)


class TransactionOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_parent_name: str | None = None
    category_emoji: str
    category_color: str
    kind: str
    amount: float
    occurred_on: dt.date
    note: str
    created_at: dt.datetime


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    total_expense: float
    total_income: float


class MutationResult(BaseModel):
    job_id: int
    message: str
    transaction: TransactionOut | None = None


class BudgetIn(BaseModel):
    name: str = Field(default="", max_length=64)
    category_id: int | None = None
    parent_id: int | None = None
    kind: str = Field(default="expense", pattern="^(expense|income)$")
    period_type: str = Field(default="month", pattern="^(day|week|month|year|custom)$")
    period_days: int | None = Field(default=None, ge=1, le=365)
    anchor_date: dt.date | None = None
    amount: float = Field(gt=0, le=100_000_000)


class BudgetUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    category_id: int | None = None
    parent_id: int | None = None
    kind: str | None = Field(default=None, pattern="^(expense|income)$")
    period_type: str | None = Field(default=None, pattern="^(day|week|month|year|custom)$")
    period_days: int | None = Field(default=None, ge=1, le=365)
    anchor_date: dt.date | None = None
    amount: float | None = Field(default=None, gt=0, le=100_000_000)
    is_active: bool | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    job_type: str
    status: str
    progress: float
    message: str
    error: str
    trigger: str
    duration_ms: int
    created_at: dt.datetime
    started_at: dt.datetime | None
    finished_at: dt.datetime | None
