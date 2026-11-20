import datetime as dt

from app.models import Category, RecurringOccurrence, RecurringTransaction, Transaction, User
from app.services.recurring import advance_date, generate_due


def test_monthly_date_clamps_to_end_of_month():
    assert advance_date(dt.date(2026, 1, 31), "monthly") == dt.date(2026, 2, 28)
    assert advance_date(dt.date(2028, 1, 31), "monthly") == dt.date(2028, 2, 29)


def test_generate_due_is_idempotent(db, monkeypatch):
    user = User(username="alice", password_hash="x")
    category = Category(user=user, name="房租", kind="expense")
    db.add_all([user, category])
    db.flush()
    template = RecurringTransaction(
        user_id=user.id, category_id=category.id, kind="expense", amount_cents=220000,
        note="月租", frequency="monthly", next_run_on=dt.date(2026, 1, 31), is_active=True,
    )
    db.add(template)
    db.commit()
    monkeypatch.setattr("app.services.recurring.patch_rollup_job", lambda *args: 1)

    created, earliest = generate_due(db, user.id, dt.date(2026, 3, 1))
    assert created == 2
    assert earliest == dt.date(2026, 1, 31)
    assert db.query(Transaction).count() == 2
    assert db.query(RecurringOccurrence).count() == 2
    assert db.get(RecurringTransaction, template.id).next_run_on == dt.date(2026, 3, 28)

    created_again, _ = generate_due(db, user.id, dt.date(2026, 3, 1))
    assert created_again == 0
    assert db.query(Transaction).count() == 2
