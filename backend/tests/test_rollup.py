import datetime as dt

from app.models import Category, Transaction, User
from app.services.rollup import recalc_from
from sqlalchemy import select
from app.models import RollupDaily, RollupPeriod


def test_recalc_builds_daily_and_period_slices(db):
    user = User(username="alice", password_hash="x")
    category = Category(user=user, name="餐饮", kind="expense")
    db.add_all([user, category])
    db.flush()
    db.add_all(
        [
            Transaction(user_id=user.id, category_id=category.id, kind="expense", amount_cents=1200, occurred_on=dt.date(2026, 1, 2)),
            Transaction(user_id=user.id, category_id=category.id, kind="expense", amount_cents=800, occurred_on=dt.date(2026, 1, 2)),
        ]
    )
    db.flush()

    summary = recalc_from(db, user.id, dt.date(2026, 1, 1), today=dt.date(2026, 1, 31))
    db.commit()

    daily = db.scalars(select(RollupDaily).where(RollupDaily.user_id == user.id)).all()
    monthly = db.scalars(select(RollupPeriod).where(RollupPeriod.user_id == user.id, RollupPeriod.granularity == "month")).all()
    assert summary["daily_rows"] == 1
    assert len(daily) == 1
    assert daily[0].amount_cents == 2000
    assert daily[0].txn_count == 2
    assert len(monthly) == 1
    assert monthly[0].amount_cents == 2000
