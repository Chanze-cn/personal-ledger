"""切片计算。

规则：
1. 流水是唯一事实来源，切片永远可以从流水重新推导；
2. 任何一天的数据发生变化，都要从这一天所在的最小切片边界开始向后重算；
3. 日切片按 (日期, 品类, 方向) 聚合，周/月/年切片按周期聚合。
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Callable

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models import RollupDaily, RollupPeriod, Transaction
from ..clock import today as local_today

GRANULARITIES = ("week", "month", "year")


# ---------------------------------------------------------------- 周期工具


def period_start(granularity: str, day: dt.date) -> dt.date:
    if granularity == "day":
        return day
    if granularity == "week":
        return day - dt.timedelta(days=day.weekday())
    if granularity == "month":
        return day.replace(day=1)
    if granularity == "year":
        return day.replace(month=1, day=1)
    raise ValueError(f"unsupported granularity: {granularity}")


def period_end(granularity: str, day: dt.date) -> dt.date:
    if granularity == "day":
        return day
    start = period_start(granularity, day)
    if granularity == "week":
        return start + dt.timedelta(days=6)
    if granularity == "month":
        return (start + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    return start.replace(month=12, day=31)


def shift_period(granularity: str, start: dt.date, steps: int) -> dt.date:
    """把周期起点向前/向后平移若干周期。"""
    if granularity == "day":
        return start + dt.timedelta(days=steps)
    if granularity == "week":
        return start + dt.timedelta(weeks=steps)
    if granularity == "month":
        total = start.year * 12 + (start.month - 1) + steps
        return dt.date(total // 12, total % 12 + 1, 1)
    if granularity == "year":
        return dt.date(start.year + steps, 1, 1)
    raise ValueError(f"unsupported granularity: {granularity}")


def period_label(granularity: str, start: dt.date) -> str:
    if granularity == "day":
        return f"{start.year} 年 {start.month} 月 {start.day} 日"
    if granularity == "week":
        iso = start.isocalendar()
        return f"{iso.year} 年第 {iso.week} 周"
    if granularity == "month":
        return f"{start.year} 年 {start.month} 月"
    return f"{start.year} 年"


# ---------------------------------------------------------------- 切片重算


def recalc_from(
    db: Session,
    user_id: int,
    from_date: dt.date,
    today: dt.date | None = None,
    on_progress: Callable[[float, str], None] | None = None,
) -> dict:
    """从 from_date 起，重算日 / 周 / 月 / 年切片。"""
    today = today or local_today()
    notice = on_progress or (lambda _pct, _msg: None)

    rows = db.execute(
        select(
            Transaction.occurred_on,
            Transaction.category_id,
            Transaction.kind,
            Transaction.amount_cents,
        ).where(Transaction.user_id == user_id, Transaction.occurred_on >= from_date)
    ).all()

    last_date = max((row[0] for row in rows), default=None)
    upper = max(today, last_date) if last_date else today

    db.execute(
        delete(RollupDaily).where(
            RollupDaily.user_id == user_id, RollupDaily.stat_date >= from_date
        )
    )
    daily: dict[tuple[dt.date, int, str], list[int]] = defaultdict(lambda: [0, 0])
    for occurred_on, category_id, kind, amount in rows:
        bucket = daily[(occurred_on, category_id, kind)]
        bucket[0] += int(amount)
        bucket[1] += 1

    db.add_all(
        [
            RollupDaily(
                user_id=user_id,
                stat_date=key[0],
                category_id=key[1],
                kind=key[2],
                amount_cents=value[0],
                txn_count=value[1],
            )
            for key, value in daily.items()
        ]
    )
    notice(0.3, f"日切片已更新：{len(daily)} 行（{from_date} → {upper}）")

    summary = {"days": (upper - from_date).days + 1, "daily_rows": len(daily)}
    step = 0.42
    for granularity in GRANULARITIES:
        p_start = period_start(granularity, from_date)
        db.execute(
            delete(RollupPeriod).where(
                RollupPeriod.user_id == user_id,
                RollupPeriod.granularity == granularity,
                RollupPeriod.period_start >= p_start,
            )
        )

        span_end = period_end(granularity, upper)
        span_rows = db.execute(
            select(
                Transaction.occurred_on,
                Transaction.category_id,
                Transaction.kind,
                Transaction.amount_cents,
            ).where(
                Transaction.user_id == user_id,
                Transaction.occurred_on >= p_start,
                Transaction.occurred_on <= span_end,
            )
        ).all()

        grouped: dict[tuple[dt.date, int, str], list[int]] = defaultdict(lambda: [0, 0])
        for occurred_on, category_id, kind, amount in span_rows:
            key = (period_start(granularity, occurred_on), category_id, kind)
            bucket = grouped[key]
            bucket[0] += int(amount)
            bucket[1] += 1

        db.add_all(
            [
                RollupPeriod(
                    user_id=user_id,
                    granularity=granularity,
                    period_start=key[0],
                    period_end=period_end(granularity, key[0]),
                    category_id=key[1],
                    kind=key[2],
                    amount_cents=value[0],
                    txn_count=value[1],
                )
                for key, value in grouped.items()
            ]
        )
        summary[f"{granularity}_rows"] = len(grouped)
        label = {"week": "周", "month": "月", "year": "年"}[granularity]
        notice(step, f"{label}切片已更新：{len(grouped)} 行")
        step = min(0.95, step + 0.17)

    db.flush()
    notice(0.98, "切片计算完成")
    return summary


def recalc_all(db: Session, user_id: int, on_progress=None) -> dict:
    """全量重建：从最早一笔流水开始。"""
    earliest = db.scalar(
        select(func.min(Transaction.occurred_on)).where(Transaction.user_id == user_id)
    )
    from_date = earliest or (local_today() - dt.timedelta(days=365))
    return recalc_from(db, user_id, from_date, on_progress=on_progress)


def recalc_range_summary(summary: dict) -> str:
    return (
        f"日 {summary.get('days', 0)} 天 / 周 {summary.get('week_rows', 0)} 行 / "
        f"月 {summary.get('month_rows', 0)} 行 / 年 {summary.get('year_rows', 0)} 行切片"
    )
