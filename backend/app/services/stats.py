"""统计与报表：全部基于切片表读取，不直接扫流水。"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Category, RollupDaily, RollupPeriod
from .rollup import period_end, period_label, period_start, shift_period

WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def to_yuan(cents: int | None) -> float:
    return round((cents or 0) / 100, 2)


def _day_rows(db: Session, user_id: int, start: dt.date, end: dt.date):
    return db.execute(
        select(
            RollupDaily.stat_date,
            RollupDaily.category_id,
            RollupDaily.kind,
            RollupDaily.amount_cents,
            RollupDaily.txn_count,
        ).where(
            RollupDaily.user_id == user_id,
            RollupDaily.stat_date >= start,
            RollupDaily.stat_date <= end,
        )
    ).all()


def _totals(db: Session, user_id: int, start: dt.date, end: dt.date) -> dict:
    rows = _day_rows(db, user_id, start, end)
    expense = sum(r[3] for r in rows if r[2] == "expense")
    income = sum(r[3] for r in rows if r[2] == "income")
    count = sum(r[4] for r in rows)
    days = (end - start).days + 1
    active_days = len({r[0] for r in rows if r[2] == "expense"})
    return {
        "expense": to_yuan(expense),
        "income": to_yuan(income),
        "net": to_yuan(income - expense),
        "txn_count": count,
        "active_days": active_days,
        "days": days,
        "avg_daily_expense": round(to_yuan(expense) / max(1, days), 2),
        "saving_rate": round((income - expense) / income * 100, 1) if income else 0.0,
    }


def category_breakdown(
    db: Session, user_id: int, start: dt.date, end: dt.date, kind: str = "expense"
) -> list[dict]:
    rows = db.execute(
        select(
            RollupDaily.category_id,
            func.sum(RollupDaily.amount_cents),
            func.sum(RollupDaily.txn_count),
        )
        .where(
            RollupDaily.user_id == user_id,
            RollupDaily.stat_date >= start,
            RollupDaily.stat_date <= end,
            RollupDaily.kind == kind,
        )
        .group_by(RollupDaily.category_id)
    ).all()

    categories = {
        c.id: c for c in db.scalars(select(Category).where(Category.user_id == user_id)).all()
    }
    total = sum(int(r[1] or 0) for r in rows) or 1
    result = []
    for category_id, amount, count in rows:
        category = categories.get(category_id)
        result.append(
            {
                "id": category_id,
                "name": category.name if category else "已删除",
                "emoji": category.emoji if category else "❓",
                "color": category.color if category else "#94A3B8",
                "amount": to_yuan(amount),
                "count": int(count or 0),
                "share": round(int(amount or 0) / total * 100, 1),
            }
        )
    result.sort(key=lambda item: item["amount"], reverse=True)
    return result


def overview(db: Session, user_id: int, start: dt.date, end: dt.date) -> dict:
    totals = _totals(db, user_id, start, end)
    breakdown = category_breakdown(db, user_id, start, end, "expense")
    top = breakdown[0] if breakdown else None
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        **totals,
        "top_category": (
            {
                "name": top["name"],
                "emoji": top["emoji"],
                "color": top["color"],
                "amount": top["amount"],
                "share": top["share"],
            }
            if top
            else None
        ),
    }


def trend(
    db: Session, user_id: int, granularity: str, start: dt.date, end: dt.date
) -> list[dict]:
    """按天/周/月返回趋势序列，周与月直接读取周期切片。"""
    if granularity in {"week", "month", "year"}:
        rows = db.execute(
            select(
                RollupPeriod.period_start,
                RollupPeriod.kind,
                func.sum(RollupPeriod.amount_cents),
            )
            .where(
                RollupPeriod.user_id == user_id,
                RollupPeriod.granularity == granularity,
                RollupPeriod.period_start >= period_start(granularity, start),
                RollupPeriod.period_start <= end,
            )
            .group_by(RollupPeriod.period_start, RollupPeriod.kind)
        ).all()
        buckets: dict[dt.date, dict[str, int]] = defaultdict(lambda: {"expense": 0, "income": 0})
        for bucket_start, kind, amount in rows:
            buckets[bucket_start][kind] += int(amount or 0)

        points = []
        cursor = period_start(granularity, start)
        last = period_start(granularity, min(end, dt.date.today() + dt.timedelta(days=370)))
        while cursor <= last:
            if granularity == "week":
                label = f"{cursor.month}/{cursor.day}"
            elif granularity == "month":
                label = f"{cursor.month}月"
            else:
                label = f"{cursor.year}"
            points.append(
                {
                    "key": cursor.isoformat(),
                    "label": label,
                    "expense": to_yuan(buckets[cursor]["expense"]),
                    "income": to_yuan(buckets[cursor]["income"]),
                }
            )
            cursor = shift_period(granularity, cursor, 1)
        return points

    rows = _day_rows(db, user_id, start, end)
    buckets: dict[dt.date, dict[str, int]] = defaultdict(lambda: {"expense": 0, "income": 0})
    for stat_date, _category_id, kind, amount, _count in rows:
        buckets[stat_date][kind] += int(amount or 0)

    points = []
    cursor = start
    while cursor <= end:
        points.append(
            {
                "key": cursor.isoformat(),
                "label": f"{cursor.month}/{cursor.day}",
                "expense": to_yuan(buckets[cursor]["expense"]),
                "income": to_yuan(buckets[cursor]["income"]),
            }
        )
        cursor += dt.timedelta(days=1)
    return points


def _delta(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def report(db: Session, user_id: int, granularity: str, anchor: dt.date) -> dict:
    start = period_start(granularity, anchor)
    end = period_end(granularity, start)
    previous_start = shift_period(granularity, start, -1)
    previous_end = period_end(granularity, previous_start)
    year_ago_steps = {"week": -52, "month": -12, "year": -1}[granularity]
    last_year_start = shift_period(granularity, start, year_ago_steps)
    last_year_end = period_end(granularity, last_year_start)

    current = _totals(db, user_id, start, end)
    previous = _totals(db, user_id, previous_start, previous_end)
    last_year = _totals(db, user_id, last_year_start, last_year_end)

    current_categories = category_breakdown(db, user_id, start, end, "expense")
    previous_categories = {
        item["id"]: item
        for item in category_breakdown(db, user_id, previous_start, previous_end, "expense")
    }
    for item in current_categories:
        before = previous_categories.get(item["id"], {}).get("amount", 0)
        item["previous_amount"] = before
        item["delta"] = _delta(item["amount"], before)

    # 趋势点：月看每天，年看 12 个月，周看 7 天
    if granularity == "year":
        points = trend(db, user_id, "month", start, end)
    else:
        points = trend(db, user_id, "day", start, end)

    # 星期分布
    weekday = [{"label": label, "expense": 0.0, "income": 0.0} for label in WEEKDAY_LABELS]
    for stat_date, _cid, kind, amount, _count in _day_rows(db, user_id, start, end):
        bucket = weekday[stat_date.weekday()]
        bucket[kind] += to_yuan(amount)

    # 月视图附带日历数据，供热力图使用
    calendar: list[dict] = []
    if granularity == "month":
        daily_map: dict[dt.date, float] = defaultdict(float)
        for stat_date, _cid, kind, amount, _count in _day_rows(db, user_id, start, end):
            if kind == "expense":
                daily_map[stat_date] += to_yuan(amount)
        peak = max(daily_map.values(), default=0) or 1
        for point in points:
            day = dt.date.fromisoformat(point["key"])
            value = round(daily_map[day], 2)
            calendar.append(
                {
                    "date": point["key"],
                    "weekday": day.weekday(),
                    "expense": value,
                    "intensity": round(value / peak, 2) if peak else 0,
                }
            )

    top_day = max(points, key=lambda item: item["expense"], default=None)
    insight = {
        "top_day": top_day["key"] if top_day and top_day["expense"] > 0 else None,
        "top_day_amount": top_day["expense"] if top_day else 0,
        "top_category": current_categories[0]["name"] if current_categories else None,
        "expense_delta": _delta(current["expense"], previous["expense"]),
        "income_delta": _delta(current["income"], previous["income"]),
        "avg_daily_expense": round(current["expense"] / max(1, current["days"]), 2),
    }

    return {
        "granularity": granularity,
        "label": period_label(granularity, start),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "previous_label": period_label(granularity, previous_start),
        "previous_start": previous_start.isoformat(),
        "previous_end": previous_end.isoformat(),
        "current": current,
        "previous": previous,
        "last_year": last_year,
        "categories": current_categories,
        "points": points,
        "weekday": weekday,
        "calendar": calendar,
        "insight": insight,
    }


def slice_list(db: Session, user_id: int, granularity: str, limit: int = 12) -> list[dict]:
    """切片浏览：直接读取预聚合的周期切片。"""
    if granularity == "day":
        rows = db.execute(
            select(
                RollupDaily.stat_date,
                func.sum(RollupDaily.amount_cents),
                RollupDaily.kind,
                func.sum(RollupDaily.txn_count),
            )
            .where(RollupDaily.user_id == user_id)
            .group_by(RollupDaily.stat_date, RollupDaily.kind)
            .order_by(RollupDaily.stat_date.desc())
            .limit(limit * 4)
        ).all()
        buckets: dict[str, dict] = {}
        for stat_date, amount, kind, count in rows:
            key = stat_date.isoformat()
            bucket = buckets.setdefault(
                key, {"period_key": key, "total_income": 0, "total_expense": 0, "txn_count": 0}
            )
            if kind == "income":
                bucket["total_income"] += int(amount or 0)
            else:
                bucket["total_expense"] += int(amount or 0)
            bucket["txn_count"] += int(count or 0)
        items = sorted(buckets.values(), key=lambda item: item["period_key"], reverse=True)[:limit]
    else:
        rows = db.execute(
            select(
                RollupPeriod.period_start,
                func.sum(RollupPeriod.amount_cents),
                RollupPeriod.kind,
                func.sum(RollupPeriod.txn_count),
            )
            .where(RollupPeriod.user_id == user_id, RollupPeriod.granularity == granularity)
            .group_by(RollupPeriod.period_start, RollupPeriod.kind)
            .order_by(RollupPeriod.period_start.desc())
            .limit(limit * 4)
        ).all()
        buckets = {}
        for period_start_date, amount, kind, count in rows:
            key = period_start_date.isoformat()
            bucket = buckets.setdefault(
                key, {"period_key": key, "total_income": 0, "total_expense": 0, "txn_count": 0}
            )
            if kind == "income":
                bucket["total_income"] += int(amount or 0)
            else:
                bucket["total_expense"] += int(amount or 0)
            bucket["txn_count"] += int(count or 0)
        items = sorted(buckets.values(), key=lambda item: item["period_key"], reverse=True)[:limit]

    return [
        {
            "period_key": item["period_key"],
            "total_income": to_yuan(item["total_income"]),
            "total_expense": to_yuan(item["total_expense"]),
            "net": to_yuan(item["total_income"] - item["total_expense"]),
            "txn_count": item["txn_count"],
        }
        for item in items
    ]
