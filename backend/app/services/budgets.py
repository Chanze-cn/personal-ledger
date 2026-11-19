"""预算窗口与执行进度计算（支持「总预算 + 品类子预算」两级结构）。

层级约定：
- 总预算：category_id 为空且 parent_id 为空，额度 = max(自身额度, 子预算额度合计)；
- 品类子预算：parent_id 指向总预算，周期强制与父预算一致；
- 独立品类预算：没有父级，自带周期。

已用金额直接扫描流水（唯一事实来源），避免异步切片未及时重算导致数字滞后。
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Budget, Category, Transaction
from .rollup import period_end, period_start
from .stats import to_yuan

PERIOD_LABELS = {"day": "每日", "week": "每周", "month": "每月", "year": "每年", "custom": "自定义"}


def budget_window(budget: Budget, today: dt.date | None = None) -> tuple[dt.date, dt.date]:
    today = today or dt.date.today()
    period_type = budget.period_type
    if period_type == "day":
        return today, today
    if period_type in {"week", "month", "year"}:
        return period_start(period_type, today), period_end(period_type, today)

    length = max(1, budget.period_days or 7)
    anchor = budget.anchor_date or today
    if today < anchor:
        return anchor, anchor + dt.timedelta(days=length - 1)
    index = (today - anchor).days // length
    start = anchor + dt.timedelta(days=index * length)
    return start, start + dt.timedelta(days=length - 1)


def window_label(budget: Budget, start: dt.date, end: dt.date) -> str:
    if budget.period_type == "day":
        return f"{start.month} 月 {start.day} 日"
    if budget.period_type == "month":
        return f"{start.year} 年 {start.month} 月"
    if budget.period_type == "year":
        return f"{start.year} 年"
    if budget.period_type == "week":
        iso = start.isocalendar()
        return f"{iso.year} 年第 {iso.week} 周"
    return f"{start.month}/{start.day} – {end.month}/{end.day} · {budget.period_days} 天"


def spend_cents(
    db: Session,
    user_id: int,
    kind: str,
    start: dt.date,
    end: dt.date,
    category_id: int | None = None,
) -> int:
    conditions = [
        Transaction.user_id == user_id,
        Transaction.kind == kind,
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
    ]
    if category_id is not None:
        # 绑一级品类时，已用金额统计其全部子品类流水
        child_ids = db.scalars(
            select(Category.id).where(Category.parent_id == category_id)
        ).all()
        conditions.append(Transaction.category_id.in_([category_id, *child_ids]))
    value = db.scalar(select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(*conditions))
    return int(value or 0)


def _category_order(category: Category | None) -> tuple[int, int]:
    if category is None:
        return 9999, 0
    return int(category.sort_order or 0), int(category.id)


def group_child_budgets(
    db: Session,
    children: list[Budget],
    categories: dict[int, Category],
    today: dt.date,
) -> list[dict]:
    """把子预算按一级品类归组。

    额度口径与「总预算 / 子预算」一致：同一父品类下
    组额度 = max(整组预算, 该组子预算合计)；没有整组预算时即为子预算合计。
    已用金额：有整组预算时用整组统计（本身已覆盖全部子品类），否则按子项累加。
    """
    buckets: dict[int, dict] = {}
    for child in children:
        category = categories.get(child.category_id or -1)
        root = category
        if category is not None and category.parent_id is not None:
            root = categories.get(category.parent_id) or category
        key = root.id if root is not None else -1
        bucket = buckets.setdefault(key, {"root": root, "whole": None, "items": []})
        if root is not None and category is not None and category.id == root.id:
            bucket["whole"] = child
        else:
            bucket["items"].append(child)

    groups: list[dict] = []
    for bucket in buckets.values():
        root: Category | None = bucket["root"]
        whole: Budget | None = bucket["whole"]
        items: list[Budget] = sorted(
            bucket["items"],
            key=lambda item: _category_order(categories.get(item.category_id or -1)),
        )
        whole_cents = int(whole.amount_cents or 0) if whole else 0
        items_cents = sum(int(item.amount_cents or 0) for item in items)
        group_cents = max(whole_cents, items_cents) if whole is not None else items_cents

        if whole is not None:
            start, end = budget_window(whole, today)
            used_cents = spend_cents(db, whole.user_id, whole.kind, start, end, whole.category_id)
        else:
            used_cents = 0
            for item in items:
                start, end = budget_window(item, today)
                used_cents += spend_cents(db, item.user_id, item.kind, start, end, item.category_id)

        ordered = ([whole] if whole is not None else []) + items
        groups.append(
            {
                "key": root.id if root is not None else -1,
                "name": root.name if root is not None else "未分组",
                "emoji": root.emoji if root is not None else "🗂️",
                "color": root.color if root is not None else "#94A3B8",
                "amount_cents": group_cents,
                "amount": to_yuan(group_cents),
                "whole_amount": to_yuan(whole_cents),
                "items_total": to_yuan(items_cents),
                "has_whole": whole is not None,
                # 子预算合计高于整组预算时，组额度按合计执行
                "overridden": whole is not None and items_cents > whole_cents,
                "used": to_yuan(used_cents),
                "children": [
                    serialize_budget(
                        db, child, categories.get(child.category_id or -1), None, categories, today
                    )
                    for child in ordered
                ],
            }
        )

    groups.sort(key=lambda group: _category_order(categories.get(group["key"])))
    return groups


def serialize_budget(
    db: Session,
    budget: Budget,
    category: Category | None,
    children: list[Budget] | None = None,
    categories: dict[int, Category] | None = None,
    today: dt.date | None = None,
) -> dict:
    today = today or dt.date.today()
    categories = categories or {}
    children = children or []
    start, end = budget_window(budget, today)

    is_total = budget.category_id is None and budget.parent_id is None
    own_cents = int(budget.amount_cents or 0)
    groups = group_child_budgets(db, children, categories, today) if is_total and children else []
    # 组额度已按「max(整组预算, 子预算合计)」收敛，总预算再与组额度合计比较
    children_total = sum(int(group["amount_cents"]) for group in groups)
    effective_cents = max(own_cents, children_total) if is_total else own_cents
    overridden = is_total and children_total > own_cents

    used_cents = spend_cents(db, budget.user_id, budget.kind, start, end, budget.category_id)
    amount = to_yuan(effective_cents)
    used = to_yuan(used_cents)
    remaining = round(amount - used, 2)
    ratio = round(used / amount * 100, 1) if amount else 0.0

    total_days = (end - start).days + 1
    if today < start:
        days_left = total_days
    elif today > end:
        days_left = 0
    else:
        days_left = (end - today).days + 1
    daily_allowance = round(max(0.0, remaining) / days_left, 2) if days_left else 0.0

    default_name = (
        ("全部" + ("收入" if budget.kind == "income" else "支出"))
        if budget.category_id is None
        else (category.name if category else "已删除品类")
    )
    parent_category = categories.get(category.parent_id) if category and category.parent_id else None
    data = {
        "id": budget.id,
        "parent_id": budget.parent_id,
        "is_total": is_total,
        "name": budget.name or default_name,
        "kind": budget.kind,
        "category_id": budget.category_id,
        "category_name": category.name if category else default_name,
        "category_parent_name": parent_category.name if parent_category else None,
        "category_emoji": category.emoji if category else ("🧮" if budget.category_id is None else "❓"),
        "category_color": category.color if category else "#6366F1",
        "period_type": budget.period_type,
        "period_days": budget.period_days,
        "anchor_date": budget.anchor_date.isoformat() if budget.anchor_date else None,
        "period_label": window_label(budget, start, end),
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "amount": to_yuan(own_cents),
        "effective_amount": amount,
        "children_total": to_yuan(children_total),
        "overridden": overridden,
        "used": used,
        "remaining": remaining,
        "ratio": ratio,
        "days_left": days_left,
        "daily_allowance": daily_allowance,
        "is_active": budget.is_active,
        "children": [],
        "groups": [],
    }
    if is_total:
        data["groups"] = groups
        data["children"] = [item for group in groups for item in group["children"]]
    return data


def list_budget_groups(
    db: Session, user_id: int, kind: str | None = None, today: dt.date | None = None
) -> dict:
    today = today or dt.date.today()
    statement = select(Budget).where(Budget.user_id == user_id, Budget.is_active.is_(True))
    if kind:
        statement = statement.where(Budget.kind == kind)
    budgets = list(db.scalars(statement.order_by(Budget.id)).all())
    categories = {
        c.id: c for c in db.scalars(select(Category).where(Category.user_id == user_id)).all()
    }

    children_map: dict[int, list[Budget]] = {}
    for budget in budgets:
        if budget.parent_id:
            children_map.setdefault(budget.parent_id, []).append(budget)

    totals: list[dict] = []
    standalone: list[dict] = []
    for budget in budgets:
        if budget.parent_id:
            continue
        if budget.category_id is None:
            totals.append(
                serialize_budget(
                    db, budget, None, children_map.get(budget.id, []), categories, today
                )
            )
        else:
            standalone.append(
                serialize_budget(db, budget, categories.get(budget.category_id), None, categories, today)
            )

    totals.sort(key=lambda item: item["ratio"], reverse=True)
    standalone.sort(key=lambda item: item["ratio"], reverse=True)

    all_items = totals + standalone
    return {
        "totals": totals,
        "standalone": standalone,
        "summary": {
            "amount": to_yuan(sum(int(round(item["effective_amount"] * 100)) for item in all_items)),
            "used": to_yuan(sum(int(round(item["used"] * 100)) for item in all_items)),
            "count": len(all_items),
            "child_count": sum(len(item["children"]) for item in totals),
        },
    }
