import datetime as dt

from app.models import Budget, Category, Transaction, User
from app.services.budgets import serialize_budget


def test_budget_alert_level_is_additive(db):
    user = User(username="alice", password_hash="x")
    category = Category(user=user, name="餐饮", kind="expense")
    db.add_all([user, category])
    db.flush()
    budget = Budget(
        user_id=user.id,
        category_id=category.id,
        kind="expense",
        period_type="month",
        anchor_date=dt.date(2026, 1, 1),
        amount_cents=10000,
    )
    db.add(budget)
    db.add(Transaction(user_id=user.id, category_id=category.id, kind="expense", amount_cents=8500, occurred_on=dt.date(2026, 1, 5)))
    db.commit()

    result = serialize_budget(db, budget, category, today=dt.date(2026, 1, 10))
    assert result["ratio"] == 85.0
    assert result["alert_level"] == "warning"
    assert result["alert_message"] == "已使用 80% 以上额度"
