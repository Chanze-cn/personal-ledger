"""异步任务：线程池执行 + 运行记录持久化（任务中心的数据来源）。

进度为 0–1 的浮点数，并同时写入可读的阶段说明（message）。
"""

from __future__ import annotations

import datetime as dt
import json
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import SessionLocal, WRITE_LOCK
from ..models import JobRun, User, now
from .rollup import recalc_all, recalc_from, recalc_range_summary

EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix="ledger-job")
MAX_HISTORY = 300
JOB_TYPE_LABELS = {
    "rollup_recalc": "增量重算",
    "rollup_daily": "日切片",
    "rollup_rebuild": "全量重建",
}


class JobProgress:
    """任务进度上报：先提交业务事务，再独立写入进度，避免写锁互相等待。"""

    def __init__(self, job_id: int, db: Session | None = None) -> None:
        self.job_id = job_id
        self._db = db
        self._lock = threading.Lock()

    def attach(self, db: Session) -> None:
        self._db = db

    def step(self, percent: float, message: str | None = None) -> None:
        with self._lock:
            if self._db is not None:
                try:
                    self._db.commit()
                except Exception:  # pragma: no cover - 事务异常由外层处理
                    self._db.rollback()
            with WRITE_LOCK, SessionLocal() as session:
                job = session.get(JobRun, self.job_id)
                if not job:
                    return
                job.progress = max(0.0, min(1.0, round(float(percent), 4)))
                if message:
                    job.message = message[:2000]
                session.commit()


def submit_job(
    user_id: int | None,
    name: str,
    job_type: str,
    fn: Callable[[JobProgress, dict], str],
    payload: dict | None = None,
    trigger: str = "manual",
) -> int:
    with WRITE_LOCK, SessionLocal() as db:
        job = JobRun(
            user_id=user_id,
            name=name,
            job_type=job_type,
            status="pending",
            progress=0.0,
            message="排队中",
            payload=json.dumps(payload or {}, ensure_ascii=False, default=str),
            trigger=trigger,
        )
        db.add(job)
        db.commit()
        job_id = job.id
    EXECUTOR.submit(_execute, job_id, fn, payload or {})
    return job_id


def _execute(job_id: int, fn: Callable[[JobProgress, dict], str], payload: dict) -> None:
    started = time.perf_counter()
    with WRITE_LOCK, SessionLocal() as db:
        job = db.get(JobRun, job_id)
        if not job:
            return
        job.status = "running"
        job.started_at = now()
        job.progress = 0.02
        job.message = "执行中"
        db.commit()

    progress = JobProgress(job_id)
    status, message, error = "success", "", ""
    try:
        message = str(fn(progress, payload) or "")
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        status = "failed"
        error = f"{type(exc).__name__}: {exc}"
        message = error

    duration = int((time.perf_counter() - started) * 1000)
    with WRITE_LOCK, SessionLocal() as db:
        job = db.get(JobRun, job_id)
        job_user_id = job.user_id if job else None
        if job:
            job.status = status
            job.progress = 1.0 if status == "success" else job.progress
            job.message = message[:2000]
            job.error = error[:2000]
            job.duration_ms = duration
            job.finished_at = now()
            db.commit()
        _cleanup_history(db, job_user_id)


def _cleanup_history(db: Session, user_id: int | None) -> None:
    """按账号各自保留最近 MAX_HISTORY 条任务记录，避免不同用户互相挤占历史。"""
    if user_id is None:
        return
    threshold = db.scalar(
        select(JobRun.id)
        .where(JobRun.user_id == user_id)
        .order_by(JobRun.id.desc())
        .offset(MAX_HISTORY)
        .limit(1)
    )
    if threshold:
        db.execute(delete(JobRun).where(JobRun.user_id == user_id, JobRun.id <= threshold))
        db.commit()


# ---------------------------------------------------------------- 具体任务


def _task_recalc(progress: JobProgress, payload: dict) -> str:
    user_id = int(payload["user_id"])
    from_date = dt.date.fromisoformat(payload["from_date"])
    with WRITE_LOCK, SessionLocal() as db:
        progress.attach(db)
        summary = recalc_from(db, user_id, from_date, on_progress=progress.step)
        db.commit()
    return f"{from_date} 起重算完成 · {recalc_range_summary(summary)}"


def _task_daily(progress: JobProgress, payload: dict) -> str:
    user_id = int(payload["user_id"])
    target = dt.date.fromisoformat(payload["target_date"])
    with WRITE_LOCK, SessionLocal() as db:
        progress.attach(db)
        summary = recalc_from(db, user_id, target, on_progress=progress.step)
        db.commit()
    return f"{target} 日切片完成 · {recalc_range_summary(summary)}"


def _task_rebuild(progress: JobProgress, payload: dict) -> str:
    user_id = int(payload["user_id"])
    with WRITE_LOCK, SessionLocal() as db:
        progress.attach(db)
        summary = recalc_all(db, user_id, on_progress=progress.step)
        db.commit()
    return f"全量重建完成 · {recalc_range_summary(summary)}"


def patch_rollup_job(
    user_id: int, from_date: dt.date, reason: str, transaction_id: int | None = None
) -> int:
    """流水变动后提交一次从 from_date 起的切片重算。"""
    # If a previous recalculation is still queued, it will see all committed
    # transactions before it starts. Reuse it when its range already covers
    # this request; running jobs are deliberately excluded because they may
    # have already taken their source snapshot.
    with WRITE_LOCK, SessionLocal() as db:
        queued = db.scalars(
            select(JobRun)
            .where(
                JobRun.user_id == user_id,
                JobRun.job_type == "rollup_recalc",
                JobRun.status == "pending",
            )
            .order_by(JobRun.id.desc())
        ).all()
        for job in queued:
            try:
                queued_from = dt.date.fromisoformat(json.loads(job.payload)["from_date"])
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
            if queued_from <= from_date:
                return job.id
    label = reason if len(reason) <= 40 else reason[:40] + "…"
    return submit_job(
        user_id=user_id,
        name=f"重算切片 · {from_date} 起 · {label}",
        job_type="rollup_recalc",
        fn=_task_recalc,
        payload={
            "user_id": user_id,
            "from_date": from_date.isoformat(),
            "transaction_id": transaction_id,
        },
    )


def daily_rollup_job(user_id: int, target: dt.date, trigger: str = "schedule") -> int:
    return submit_job(
        user_id=user_id,
        name=f"日切片 · {target.isoformat()}",
        job_type="rollup_daily",
        fn=_task_daily,
        payload={"user_id": user_id, "target_date": target.isoformat()},
        trigger=trigger,
    )


def rebuild_job(user_id: int, trigger: str = "manual") -> int:
    return submit_job(
        user_id=user_id,
        name="全量重建 · 全部品类",
        job_type="rollup_rebuild",
        fn=_task_rebuild,
        payload={"user_id": user_id},
        trigger=trigger,
    )


def _active_users() -> list[User]:
    with SessionLocal() as db:
        return list(db.scalars(select(User).where(User.is_active.is_(True))).all())


def schedule_startup_calibration() -> list[int]:
    """启动校准：为每个启用用户补一次昨天的日切片。"""
    target = dt.date.today() - dt.timedelta(days=1)
    return [daily_rollup_job(user.id, target, trigger="system") for user in _active_users()]


def schedule_daily_rollup() -> list[int]:
    target = dt.date.today()
    return [daily_rollup_job(user.id, target, trigger="schedule") for user in _active_users()]


def schedule_catchup() -> list[int]:
    """补偿巡检：当日有流水但缺日切片的用户，自动补一个任务。"""
    from ..models import RollupDaily, Transaction

    today = dt.date.today()
    job_ids: list[int] = []
    for user in _active_users():
        with SessionLocal() as db:
            has_txn = db.scalar(
                select(Transaction.id)
                .where(Transaction.user_id == user.id, Transaction.occurred_on >= today)
                .limit(1)
            )
            if not has_txn:
                continue
            has_slice = db.scalar(
                select(RollupDaily.id)
                .where(RollupDaily.user_id == user.id, RollupDaily.stat_date >= today)
                .limit(1)
            )
        if not has_slice:
            job_ids.append(daily_rollup_job(user.id, today, trigger="system"))
    return job_ids


def job_type_label(job_type: str) -> str:
    return JOB_TYPE_LABELS.get(job_type, job_type)
