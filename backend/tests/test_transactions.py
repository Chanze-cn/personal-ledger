import datetime as dt

from app.models import Category, User
from app.routers.transactions import export_transactions, import_transactions
from app.schemas import TransactionImportRequest, TransactionImportRow


def test_import_batches_rows_and_returns_job_id(db, monkeypatch):
    user = User(username="alice", password_hash="x")
    category = Category(user=user, name="餐饮", kind="expense")
    db.add_all([user, category])
    db.flush()
    monkeypatch.setattr("app.routers.transactions.patch_rollup_job", lambda *args: 42)

    result = import_transactions(
        TransactionImportRequest(
            rows=[
                TransactionImportRow(
                    category_id=category.id,
                    amount=12.34,
                    occurred_on=dt.date(2026, 1, 2),
                    note="早餐",
                )
            ]
        ),
        user,
        db,
    )
    assert result["created"] == 1
    assert result["job_id"] == 42

    response = export_transactions(user=user, db=db)
    assert response.media_type.startswith("text/csv")
    assert "2026-01-02,12.34" in response.body.decode("utf-8-sig")
