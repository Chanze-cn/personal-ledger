import datetime as dt
import json

from app.models import JobRun, User
from app.services.jobs import patch_rollup_job


def test_queued_rollup_job_is_reused(db, monkeypatch):
    user = User(username="alice", password_hash="x")
    db.add(user)
    db.flush()
    existing = JobRun(
        user_id=user.id,
        name="existing",
        job_type="rollup_recalc",
        status="pending",
        payload=json.dumps({"from_date": "2026-01-01"}),
    )
    db.add(existing)
    db.commit()

    monkeypatch.setattr("app.services.jobs.SessionLocal", lambda: db)
    assert patch_rollup_job(user.id, dt.date(2026, 1, 5), "新增流水") == existing.id
