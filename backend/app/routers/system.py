"""系统信息与可选的演示数据（默认不写入任何业务数据）。"""

from __future__ import annotations

import datetime as dt
import json
import random

from fastapi import APIRouter, Depends, Response
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

# 末级（子）品类 -> (候选金额, 每日出现概率, 备注候选)，用于演示两级品类效果
DEMO_TEMPLATES: dict[str, tuple[list[float], float, list[str]]] = {
    "早餐": ([8, 12, 15, 18], 0.8, ["豆浆油条", "三明治", "楼下面包"]),
    "午餐": ([22, 28, 35, 45], 0.9, ["公司食堂", "盖饭", "面馆"]),
    "晚餐": ([25, 38, 52, 68], 0.6, ["家常菜", "火锅", "和朋友吃饭"]),
    "外卖": ([26, 35, 48], 0.35, ["加班外卖", "夜宵"]),
    "饮料咖啡": ([9, 15, 22, 32], 0.5, ["瑞幸", "奶茶", "星巴克"]),
    "零食": ([8, 16, 25], 0.25, ["便利店零食"]),
    "地铁公交": ([3, 4, 6], 0.75, ["通勤"]),
    "打车": ([18, 26, 42], 0.2, ["加班打车"]),
    "加油": ([260, 380], 0.04, ["加油"]),
    "停车": ([5, 10], 0.08, ["停车费"]),
    "日用百货": ([29, 59, 129], 0.12, ["超市补给", "纸品"]),
    "服饰": ([159, 299, 599], 0.06, ["衣服", "鞋子"]),
    "数码配件": ([99, 399], 0.03, ["耳机", "数据线"]),
    "美妆护肤": ([89, 199], 0.05, ["护肤"]),
    "房租": ([2200], 0.03, ["月租"]),
    "物业": ([180], 0.03, ["物业费"]),
    "水电燃气": ([68, 128], 0.05, ["电费", "燃气费"]),
    "家居": ([45, 159], 0.05, ["收纳", "小家具"]),
    "电影": ([35, 45], 0.07, ["电影票"]),
    "游戏": ([30, 68], 0.05, ["游戏充值"]),
    "演出": ([120, 280], 0.02, ["livehouse"]),
    "门诊": ([36, 88], 0.02, ["挂号"]),
    "药品": ([25, 46], 0.03, ["常备药"]),
    "体检": ([360], 0.02, ["年度体检"]),
    "书籍": ([39, 68], 0.04, ["买书"]),
    "课程": ([99, 199], 0.03, ["网课"]),
    "考试": ([120], 0.02, ["报名费"]),
    "话费": ([39, 59], 0.04, ["月租套餐"]),
    "宽带": ([60], 0.02, ["宽带续费"]),
    "会员订阅": ([15, 25, 45], 0.07, ["视频会员", "音乐会员"]),
    "礼物": ([88, 199], 0.03, ["生日礼物"]),
    "红包支出": ([100, 200], 0.03, ["随礼"]),
}
INCOME_TEMPLATES: dict[str, tuple[list[float], float, list[str]]] = {
    "月薪": ([18600], 1.0, ["月薪"]),
    "利息": ([120, 260], 0.2, ["存款利息"]),
    "基金股票": ([180, 580], 0.15, ["基金分红"]),
    "外包": ([800, 1500], 0.08, ["外包项目"]),
}

# 演示预算：(品类名, 额度元)；None 表示不绑品类
DEMO_BUDGETS: list[tuple[str | None, float]] = [
    (None, 8000),
    ("餐饮", 2500),
    ("早餐", 300),
    ("交通", 800),
]


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


@router.get("/export", summary="导出当前账号 JSON 备份")
def export_account_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """导出可长期保存的业务数据快照，不修改任何现有数据。"""
    categories = db.scalars(
        select(Category).where(Category.user_id == user.id).order_by(Category.id)
    ).all()
    transactions = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.occurred_on, Transaction.id)
    ).all()
    budgets = db.scalars(
        select(Budget).where(Budget.user_id == user.id).order_by(Budget.id)
    ).all()
    bundle = {
        "format_version": 1,
        "exported_at": dt.datetime.now().isoformat(timespec="seconds"),
        "user": {
            "username": user.username,
            "display_name": user.display_name,
            "avatar_emoji": user.avatar_emoji,
            "currency": user.currency,
        },
        "categories": [
            {"id": item.id, "parent_id": item.parent_id, "name": item.name, "emoji": item.emoji,
             "kind": item.kind, "color": item.color, "sort_order": item.sort_order,
             "is_archived": item.is_archived}
            for item in categories
        ],
        "transactions": [
            {"id": item.id, "category_id": item.category_id, "kind": item.kind,
             "amount_cents": item.amount_cents, "occurred_on": item.occurred_on.isoformat(),
             "note": item.note or ""}
            for item in transactions
        ],
        "budgets": [
            {"id": item.id, "parent_id": item.parent_id, "category_id": item.category_id,
             "name": item.name, "kind": item.kind, "period_type": item.period_type,
             "period_days": item.period_days,
             "anchor_date": item.anchor_date.isoformat() if item.anchor_date else None,
             "amount_cents": item.amount_cents, "is_active": item.is_active}
            for item in budgets
        ],
    }
    filename = f"ledger-backup-{dt.date.today().isoformat()}.json"
    return Response(
        content=json.dumps(bundle, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/demo-data", summary="生成示例数据（40 天，含两级品类与示例预算）")
def generate_demo_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    categories = db.scalars(
        select(Category).where(Category.user_id == user.id, Category.is_archived.is_(False))
    ).all()
    by_name: dict[tuple[str, str], Category] = {(c.name, c.kind): c for c in categories}

    rng = random.Random(20261116)
    today = dt.date.today()
    created = 0
    budgets_created = 0
    with WRITE_LOCK:
        for offset in range(39, -1, -1):
            day = today - dt.timedelta(days=offset)
            for name, (amounts, probability, notes) in DEMO_TEMPLATES.items():
                category = by_name.get((name, "expense"))
                # 只往末级品类记账，父品类不参与示例数据
                if category is None or category.parent_id is None or rng.random() > probability:
                    continue
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
                    if category is None or category.parent_id is None:
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

        # 没有任何预算时，创建一套「总预算 + 一级/二级品类预算」用于验证层级统计
        has_budget = db.scalar(
            select(func.count(Budget.id)).where(Budget.user_id == user.id)
        )
        if not int(has_budget or 0):
            total_budget: Budget | None = None
            for name, amount in DEMO_BUDGETS:
                category = by_name.get((name, "expense")) if name else None
                if name and category is None:
                    continue
                budget = Budget(
                    user_id=user.id,
                    parent_id=total_budget.id if total_budget else None,
                    name="",
                    category_id=category.id if category else None,
                    kind="expense",
                    period_type="month",
                    anchor_date=today.replace(day=1),
                    amount_cents=int(round(amount * 100)),
                )
                db.add(budget)
                db.flush()
                budgets_created += 1
                if total_budget is None:
                    total_budget = budget
        db.commit()

    job_id = rebuild_job(user.id, trigger="system")
    message = f"已生成 {created} 笔示例流水"
    if budgets_created:
        message += f"、{budgets_created} 个示例预算"
    return {
        "job_id": job_id,
        "created": created,
        "budgets_created": budgets_created,
        "message": f"{message}，正在重建切片",
    }


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
