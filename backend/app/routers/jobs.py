"""异步任务运营接口：任务列表、详情、统计、手动触发。"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JobRun, User
from ..schemas import JobOut
from ..services.jobs import daily_rollup_job, job_type_label, rebuild_job
from ..clock import today as local_today

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _base_query(user: User, scope: str):
    statement = select(JobRun)
    if scope != "all" or user.role != "admin":
        statement = statement.where(JobRun.user_id == user.id)
    return statement


@router.get("", response_model=list[JobOut], summary="任务运行列表")
def list_jobs(
    limit: int = Query(default=30, ge=1, le=200),
    status_filter: str | None = Query(default=None, alias="status"),
    scope: str = Query(default="mine", pattern="^(mine|all)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobOut]:
    statement = _base_query(user, scope)
    if status_filter:
        statement = statement.where(JobRun.status == status_filter)
    rows = db.scalars(statement.order_by(JobRun.id.desc()).limit(limit)).all()
    return [JobOut.model_validate(row) for row in rows]


@router.get("/stats", summary="任务统计")
def job_stats(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    rows = db.execute(
        select(JobRun.status, func.count(JobRun.id))
        .where(JobRun.user_id == user.id)
        .group_by(JobRun.status)
    ).all()
    counts = {row[0]: int(row[1]) for row in rows}
    durations = db.execute(
        select(JobRun.job_type, func.avg(JobRun.duration_ms))
        .where(JobRun.user_id == user.id, JobRun.status == "success")
        .group_by(JobRun.job_type)
    ).all()
    return {
        "counts": {
            "pending": counts.get("pending", 0),
            "running": counts.get("running", 0),
            "success": counts.get("success", 0),
            "failed": counts.get("failed", 0),
        },
        "avg_duration_ms": {
            job_type_label(row[0]): int(row[1] or 0) for row in durations
        },
    }


@router.get("/{job_id}", response_model=JobOut, summary="任务详情")
def get_job(
    job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> JobOut:
    job = db.get(JobRun, job_id)
    if job is None or (job.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="任务不存在")
    return JobOut.model_validate(job)


@router.post("/rebuild", summary="全量重建切片")
def trigger_rebuild(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    job_id = rebuild_job(user.id, trigger="manual")
    return {"job_id": job_id, "message": "全量重建任务已提交"}


@router.post("/daily", summary="触发当日日切片")
def trigger_daily(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    job_id = daily_rollup_job(user.id, local_today(), trigger="manual")
    return {"job_id": job_id, "message": "当日切片任务已提交"}
