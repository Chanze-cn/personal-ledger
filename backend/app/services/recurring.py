from __future__ import annotations

import calendar
import datetime as dt

from sqlalchemy import func, select

from ..database import SessionLocal, WRITE_LOCK
from ..models import Category, RecurringOccurrence, RecurringTransaction, Transaction, User
from .jobs import patch_rollup_job
from .stats import to_yuan


def advance_date(day: dt.date, frequency: str) -> dt.date:
    if frequency == "daily":
        return day + dt.timedelta(days=1)
    if frequency == "weekly":
        return day + dt.timedelta(weeks=1)
    if frequency == "yearly":
        year = day.year + 1
        return day.replace(year=year)
    total = day.year * 12 + day.month
    year, month = divmod(total, 12)
    month += 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def serialize_template(db, item: RecurringTransaction) -> dict:
    count = db.scalar(
        select(func.count(RecurringOccurrence.id)).where(RecurringOccurrence.template_id == item.id)
    ) or 0
    return {
        "id": item.id,
        "category_id": item.category_id,
        "category_name": item.category.name if item.category else "已删除品类",
        "category_emoji": item.category.emoji if item.category else "❓",
        "kind": item.kind,
        "amount": to_yuan(item.amount_cents),
        "note": item.note or "",
        "frequency": item.frequency,
        "next_run_on": item.next_run_on,
        "is_active": item.is_active,
        "generated_count": int(count),
    }


def generate_due(db, user_id: int, as_of: dt.date | None = None) -> tuple[int, dt.date | None]:
    as_of = as_of or dt.date.today()
    created = 0
    earliest: dt.date | None = None
    with WRITE_LOCK:
        templates = list(db.scalars(select(RecurringTransaction).where(
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.is_active.is_(True),
            RecurringTransaction.next_run_on <= as_of,
        )).all())
        for template in templates:
            run_on = template.next_run_on
            while run_on <= as_of:
                exists = db.scalar(select(RecurringOccurrence.id).where(
                    RecurringOccurrence.template_id == template.id,
                    RecurringOccurrence.occurred_on == run_on,
                ))
                if exists is None:
                    txn = Transaction(
                        user_id=user_id, category_id=template.category_id, kind=template.kind,
                        amount_cents=template.amount_cents, occurred_on=run_on, note=template.note,
                    )
                    db.add(txn)
                    db.flush()
                    db.add(RecurringOccurrence(template_id=template.id, transaction_id=txn.id, occurred_on=run_on))
                    created += 1
                    earliest = run_on if earliest is None else min(earliest, run_on)
                run_on = advance_date(run_on, template.frequency)
            template.next_run_on = run_on
        db.commit()
    if created and earliest is not None:
        patch_rollup_job(user_id, earliest, "生成周期流水")
    return created, earliest


def generate_due_for_all_users(as_of: dt.date | None = None) -> int:
    with SessionLocal() as db:
        users = list(db.scalars(select(User).where(User.is_active.is_(True))).all())
    total = 0
    for user in users:
        with SessionLocal() as db:
            total += generate_due(db, user.id, as_of)[0]
    return total
