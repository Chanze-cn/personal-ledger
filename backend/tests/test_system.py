import json

from app.models import Category, User
from app.routers.system import export_account_data


def test_account_backup_is_json_and_scoped_to_user(db):
    user = User(username="alice", password_hash="x")
    other = User(username="bob", password_hash="x")
    db.add_all([user, other])
    db.flush()
    db.add_all([
        Category(user_id=user.id, name="餐饮", kind="expense"),
        Category(user_id=other.id, name="其他", kind="expense"),
    ])
    db.commit()

    response = export_account_data(user, db)
    payload = json.loads(response.body)
    assert payload["format_version"] == 1
    assert [item["name"] for item in payload["categories"]] == ["餐饮"]
    assert response.headers["content-disposition"].startswith("attachment;")
