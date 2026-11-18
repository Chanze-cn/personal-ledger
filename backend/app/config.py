"""全局配置：所有可变项都支持环境变量覆盖，保证本地与部署环境一致。"""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("LEDGER_DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "ledger.db"
DATABASE_URL = os.getenv("LEDGER_DATABASE_URL", f"sqlite:///{DB_PATH}")

SECRET_KEY = os.getenv("LEDGER_SECRET_KEY", "ledger-local-dev-secret-key-please-change")
TOKEN_TTL_HOURS = int(os.getenv("LEDGER_TOKEN_TTL_HOURS", "72"))

# 传输加密：RSA 私钥文件（首次启动自动生成，权限 600）
AUTH_KEY_PATH = Path(os.getenv("LEDGER_AUTH_KEY_PATH", str(DATA_DIR / "auth_key.pem")))
# 一次性握手随机串有效期（秒）与请求时间窗（秒）
NONCE_TTL_SECONDS = int(os.getenv("LEDGER_NONCE_TTL_SECONDS", "120"))
REQUEST_TS_WINDOW_SECONDS = int(os.getenv("LEDGER_REQUEST_TS_WINDOW_SECONDS", "300"))

FRONTEND_DIST = Path(
    os.getenv("LEDGER_FRONTEND_DIST", str(BASE_DIR.parent / "frontend" / "dist"))
)

APP_NAME = "Ledger"
APP_TAGLINE = "以流水为基准的个人记账与预算系统"

# 默认账号（仅在首次启动、用户不存在时创建）
SEED_USERNAME = os.getenv("LEDGER_SEED_USERNAME", "chanzezheng")
SEED_PASSWORD = os.getenv("LEDGER_SEED_PASSWORD", "123456")

# 日切片定时任务执行时间（本地时区）
DAILY_JOB_HOUR = int(os.getenv("LEDGER_DAILY_JOB_HOUR", "0"))
DAILY_JOB_MINUTE = int(os.getenv("LEDGER_DAILY_JOB_MINUTE", "5"))
# 补偿巡检间隔（分钟）：当日有流水但没有日切片时自动补算
CATCHUP_INTERVAL_MINUTES = int(os.getenv("LEDGER_CATCHUP_INTERVAL_MINUTES", "15"))

# 默认品类：仅作为账号的基础配置，不创建任何流水/预算数据
DEFAULT_CATEGORIES: list[dict] = [
    {"name": "餐饮", "emoji": "🍜", "kind": "expense", "color": "#F97316"},
    {"name": "交通", "emoji": "🚇", "kind": "expense", "color": "#0EA5E9"},
    {"name": "购物", "emoji": "🛍️", "kind": "expense", "color": "#EC4899"},
    {"name": "居住", "emoji": "🏠", "kind": "expense", "color": "#6366F1"},
    {"name": "娱乐", "emoji": "🎮", "kind": "expense", "color": "#8B5CF6"},
    {"name": "医疗", "emoji": "💊", "kind": "expense", "color": "#EF4444"},
    {"name": "学习", "emoji": "📚", "kind": "expense", "color": "#14B8A6"},
    {"name": "通讯", "emoji": "📱", "kind": "expense", "color": "#06B6D4"},
    {"name": "旅行", "emoji": "✈️", "kind": "expense", "color": "#22C55E"},
    {"name": "宠物", "emoji": "🐾", "kind": "expense", "color": "#A16207"},
    {"name": "人情", "emoji": "🎁", "kind": "expense", "color": "#F43F5E"},
    {"name": "其他", "emoji": "📦", "kind": "expense", "color": "#94A3B8"},
    {"name": "工资", "emoji": "💰", "kind": "income", "color": "#10B981"},
    {"name": "奖金", "emoji": "🏆", "kind": "income", "color": "#059669"},
    {"name": "理财", "emoji": "📈", "kind": "income", "color": "#0D9488"},
    {"name": "兼职", "emoji": "💼", "kind": "income", "color": "#65A30D"},
    {"name": "红包", "emoji": "🧧", "kind": "income", "color": "#DC2626"},
    {"name": "其他", "emoji": "💵", "kind": "income", "color": "#64748B"},
]
