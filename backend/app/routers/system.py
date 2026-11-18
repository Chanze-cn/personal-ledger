"""系统信息与可选的演示数据（默认不写入任何业务数据）。"""

from __future__ import annotations

import datetime as dt
import random

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import APP_NAME, CATCHUP_INTERVAL_MINUTES, DAILY_JOB_HOUR, DAILY_JOB_MINUTE
from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import (
    Budget,
    Category,
    JobRun,
    RollupDaily,
    RollupPeriod,
    Transaction,
    User,
)
from ..services.jobs import rebuild_job

router = APIRouter(prefix="/system", tags=["system"])

# 品类 -> (候选金额, 每日出现概率, 备注候选)
DEMO_TEMPLATES: dict[str, tuple[list[float], float, list[str]]] = {
    "餐饮": ([18, 26, 32, 45, 58, 88], 1.0, ["早餐", "午饭", "晚饭", "咖啡", "外卖", "和朋友吃饭"]),
    "交通": ([3, 6, 12, 20, 38], 0.55, ["地铁", "公交", "打车", "加油"]),
    "购物": ([59, 129, 219, 399, 699], 0.18, ["日用补给", "衣服", "数码配件", "家居好物"]),
    "居住": ([2200, 260], 0.03, ["房租", "物业费"]),
    "娱乐": ([45, 68, 128, 25], 0.2, ["电影", "演出", "游戏", "会员续费"]),
    "医疗": ([36, 88, 160], 0.05, ["药品", "门诊", "体检"]),
    "学习": ([99, 199, 45], 0.08, ["课程", "书籍", "订阅"]),
    "通讯": ([59, 99], 0.04, ["话费", "宽带"]),
    "旅行": ([580, 1280], 0.03, ["周末出行", "机票", "住宿"]),
    "宠物": ([65, 120], 0.05, ["猫粮", "宠物医院"]),
    "人情": ([200, 520, 66], 0.05, ["红包", "生日礼物", "聚餐 AA"]),
}
INCOME_TEMPLATES: dict[str, tuple[list[float], float, list[str]]] = {
    "工资": ([18600], 1.0, ["月薪"]),
    "理财": ([120, 260, 580], 0.25, ["基金分红", "利息"]),
    "兼职": ([800, 1500], 0.1, ["外包项目"]),
}


@router.get("/info", summary="系统运行信息")
def system_info(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    txn_count = db.scalar(select(func.count(Transaction.id)).where(Transaction.user_id == user.id)) or 0
    daily_rows = db.scalar(select(func.count(RollupDaily.id)).where(RollupDaily.user_id == user.id)) or 0
    period_rows = (
        db.scalar(select(func.count(RollupPeriod.id)).where(RollupPeriod.user_id == user.id)) or 0
    )
    budget_count = db.scalar(select(func.count(Budget.id)).where(Budget.user_id == user.id)) or 0
    last_job = db.scalars(
        select(JobRun).where(JobRun.user_id == user.id).order_by(JobRun.id.desc()).limit(1)
    ).first()

    return {
        "app": APP_NAME,
        "server_time": dt.datetime.now().isoformat(timespec="seconds"),
        "today": dt.date.today().isoformat(),
        "txn_count": int(txn_count),
        "daily_rows": int(daily_rows),
        "period_rows": int(period_rows),
        "budget_count": int(budget_count),
        "scheduler": {
            "daily_rollup_at": f"{DAILY_JOB_HOUR:02d}:{DAILY_JOB_MINUTE:02d}",
            "catchup_every_minutes": CATCHUP_INTERVAL_MINUTES,
            "desc": "每天定时对流水做日切片；每 15 分钟巡检缺失切片并自动补算",
        },
        "transport": "RSA-OAEP-256 + AES-256-GCM（登录凭据不明文过网）",
        "last_job": (
            {
                "id": last_job.id,
                "name": last_job.name,
                "status": last_job.status,
                "finished_at": last_job.finished_at.isoformat() if last_job.finished_at else None,
            }
            if last_job
            else None
        ),
    }


@router.post("/demo-data", summary="生成示例数据（40 天，可选操作）")
def generate_demo_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    categories = db.scalars(select(Category).where(Category.user_id == user.id)).all()
    by_name: dict[tuple[str, str], Category] = {(c.name, c.kind): c for c in categories}

    rng = random.Random(20261116)
    today = dt.date.today()
    created = 0
    with WRITE_LOCK:
        for offset in range(39, -1, -1):
            day = today - dt.timedelta(days=offset)
            for name, (amounts, probability, notes) in DEMO_TEMPLATES.items():
                category = by_name.get((name, "expense"))
                if category is None or rng.random() > probability:
                    continue
                times = 2 if name == "餐饮" and rng.random() < 0.5 else 1
                for _ in range(times):
                    db.add(
                        Transaction(
                            user_id=user.id,
                            category_id=category.id,
                            kind="expense",
                            amount_cents=int(round(rng.choice(amounts) * 100)),
                            occurred_on=day,
                            note=rng.choice(notes),
                        )
                    )
                    created += 1
            if day.day == 10:
                for name, (amounts, _probability, notes) in INCOME_TEMPLATES.items():
                    category = by_name.get((name, "income"))
                    if category is None:
                        continue
                    db.add(
                        Transaction(
                            user_id=user.id,
                            category_id=category.id,
                            kind="income",
                            amount_cents=int(round(rng.choice(amounts) * 100)),
                            occurred_on=day,
                            note=rng.choice(notes),
                        )
                    )
                    created += 1
        db.commit()

    job_id = rebuild_job(user.id, trigger="system")
    return {"job_id": job_id, "created": created, "message": f"已生成 {created} 笔示例流水，正在重建切片"}


@router.delete("/data", summary="清空当前用户的业务数据（保留品类）")
def reset_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    with WRITE_LOCK:
        db.execute(delete(Transaction).where(Transaction.user_id == user.id))
        db.execute(delete(RollupDaily).where(RollupDaily.user_id == user.id))
        db.execute(delete(RollupPeriod).where(RollupPeriod.user_id == user.id))
        db.execute(delete(Budget).where(Budget.user_id == user.id))
        db.commit()
    return {"ok": True, "message": "流水、切片与预算已清空"}
