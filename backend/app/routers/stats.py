"""统计看板与报表接口。"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JobRun, Transaction, User
from ..services import stats as stats_service
from ..clock import today as local_today
from ..services.budgets import list_budget_groups
from ..services.rollup import period_end, period_start, shift_period
from .transactions import serialize_transaction

router = APIRouter(prefix="/stats", tags=["stats"])


def _resolve_range(start: dt.date | None, end: dt.date | None) -> tuple[dt.date, dt.date]:
    end_date = end or local_today()
    start_date = start or end_date.replace(day=1)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    if (end_date - start_date).days > 1200:
        raise HTTPException(status_code=400, detail="统计区间过长")
    return start_date, end_date


@router.get("/overview", summary="区间收支概览")
def overview(
    start: dt.date | None = None,
    end: dt.date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    start_date, end_date = _resolve_range(start, end)
    return stats_service.overview(db, user.id, start_date, end_date)


@router.get("/trend", summary="收支趋势（日/周/月/年）")
def trend(
    granularity: str = Query(default="day", pattern="^(day|week|month|year)$"),
    start: dt.date | None = None,
    end: dt.date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    start_date, end_date = _resolve_range(start, end)
    return stats_service.trend(db, user.id, granularity, start_date, end_date)


@router.get("/categories", summary="分类支出/收入构成")
def categories(
    start: dt.date | None = None,
    end: dt.date | None = None,
    kind: str = Query(default="expense", pattern="^(expense|income)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    start_date, end_date = _resolve_range(start, end)
    return stats_service.category_breakdown(db, user.id, start_date, end_date, kind)


@router.get("/report", summary="周/月/年报表（含环比、同比与日历数据）")
def report(
    period: str = Query(default="month", pattern="^(week|month|year)$"),
    anchor: dt.date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return stats_service.report(db, user.id, period, anchor or local_today())


@router.get("/slices", summary="统计切片浏览")
def slices(
    granularity: str = Query(default="day", pattern="^(day|week|month|year)$"),
    limit: int = Query(default=12, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    return stats_service.slice_list(db, user.id, granularity, limit)


@router.get("/dashboard", summary="看板聚合数据")
def dashboard(
    anchor: dt.date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    today = local_today()
    anchor = anchor or today
    month_start = period_start("month", anchor)
    month_end = period_end("month", month_start)
    prev_start = shift_period("month", month_start, -1)
    prev_end = period_end("month", prev_start)

    current = stats_service.overview(db, user.id, month_start, month_end)
    previous = stats_service.overview(db, user.id, prev_start, prev_end)
    # 趋势只到今天，避免未来日期出现 0 值长尾
    trend_start = max(month_start, today - dt.timedelta(days=29))
    trend_end = min(month_end, today)
    trend_points = stats_service.trend(db, user.id, "day", trend_start, max(trend_start, trend_end))
    categories = stats_service.category_breakdown(db, user.id, month_start, month_end, "expense")

    recent = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.occurred_on.desc(), Transaction.id.desc())
        .limit(6)
    ).all()

    running_jobs = (
        db.scalar(
            select(func.count(JobRun.id)).where(
                JobRun.user_id == user.id, JobRun.status.in_(("pending", "running"))
            )
        )
        or 0
    )
    finished_today = (
        db.scalar(
            select(func.count(JobRun.id)).where(
                JobRun.user_id == user.id,
                JobRun.status.in_(("success", "failed")),
                func.date(JobRun.created_at) == today.isoformat(),
            )
        )
        or 0
    )

    expense_delta = None
    if previous["expense"]:
        expense_delta = round(
            (current["expense"] - previous["expense"]) / previous["expense"] * 100, 1
        )

    return {
        "month": {
            "label": f"{month_start.year} 年 {month_start.month} 月",
            "start": month_start.isoformat(),
            "end": month_end.isoformat(),
            **current,
            "previous_expense": previous["expense"],
            "expense_delta": expense_delta,
        },
        "trend": trend_points,
        "categories": categories,
        "recent": [serialize_transaction(txn).model_dump(mode="json") for txn in recent],
        "budgets": list_budget_groups(db, user.id, today=today),
        "jobs": {"running": int(running_jobs), "finished_today": int(finished_today)},
        "meta": {"today": today.isoformat()},
    }
