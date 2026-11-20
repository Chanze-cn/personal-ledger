import datetime as dt

from app.models import Budget, Category, User
from app.routers.budgets import update_budget
from app.schemas import BudgetUpdate


def test_budget_edit_persists_category_change(db):
    user = User(username="alice", password_hash="x")
    old_category = Category(user=user, name="餐饮", kind="expense")
    new_category = Category(user=user, name="交通", kind="expense")
    db.add_all([user, old_category, new_category])
    db.flush()
    budget = Budget(
        user_id=user.id,
        category_id=old_category.id,
        kind="expense",
        period_type="month",
        anchor_date=dt.date(2026, 1, 1),
        amount_cents=10000,
    )
    db.add(budget)
    db.commit()

    result = update_budget(budget.id, BudgetUpdate(category_id=new_category.id), user, db)
    assert result["category_id"] == new_category.id
    assert db.get(Budget, budget.id).category_id == new_category.id


def test_child_budget_inherits_parent_window(db):
    user = User(username="alice", password_hash="x")
    category = Category(user=user, name="餐饮", kind="expense")
    db.add_all([user, category])
    db.flush()
    parent = Budget(
        user_id=user.id,
        kind="expense",
        period_type="week",
        anchor_date=dt.date(2026, 1, 5),
        amount_cents=10000,
    )
    db.add(parent)
    db.flush()
    child = Budget(
        user_id=user.id,
        parent_id=parent.id,
        category_id=category.id,
        kind="expense",
        period_type="month",
        anchor_date=dt.date(2026, 2, 1),
        amount_cents=1000,
    )
    db.add(child)
    db.commit()

    result = update_budget(child.id, BudgetUpdate(period_type="year"), user, db)
    assert result["period_type"] == "week"
    assert result["anchor_date"] == "2026-01-05"
