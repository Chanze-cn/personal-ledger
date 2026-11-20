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
ENVIRONMENT = os.getenv("LEDGER_ENV", "development").strip().lower()
if ENVIRONMENT in {"production", "prod"} and SECRET_KEY == "ledger-local-dev-secret-key-please-change":
    raise RuntimeError("LEDGER_SECRET_KEY must be set when LEDGER_ENV=production")
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

# 日切片定时任务执行时间（本地时区）
DAILY_JOB_HOUR = int(os.getenv("LEDGER_DAILY_JOB_HOUR", "0"))
DAILY_JOB_MINUTE = int(os.getenv("LEDGER_DAILY_JOB_MINUTE", "5"))
# 补偿巡检间隔（分钟）：当日有流水但没有日切片时自动补算
CATCHUP_INTERVAL_MINUTES = int(os.getenv("LEDGER_CATCHUP_INTERVAL_MINUTES", "15"))

# 默认品类：两级结构，一级为分组，二级为记账末级；仅作为账号的基础配置，不写流水/预算
DEFAULT_CATEGORIES: list[dict] = [
    {
        "name": "餐饮",
        "emoji": "🍜",
        "kind": "expense",
        "color": "#F97316",
        "children": [
            {"name": "早餐", "emoji": "🥐"},
            {"name": "午餐", "emoji": "🍱"},
            {"name": "晚餐", "emoji": "🍚"},
            {"name": "外卖", "emoji": "🛵"},
            {"name": "饮料咖啡", "emoji": "☕"},
            {"name": "零食", "emoji": "🍪"},
        ],
    },
    {
        "name": "交通",
        "emoji": "🚇",
        "kind": "expense",
        "color": "#0EA5E9",
        "children": [
            {"name": "地铁公交", "emoji": "🚌"},
            {"name": "打车", "emoji": "🚕"},
            {"name": "加油", "emoji": "⛽"},
            {"name": "停车", "emoji": "🅿️"},
        ],
    },
    {
        "name": "购物",
        "emoji": "🛍️",
        "kind": "expense",
        "color": "#EC4899",
        "children": [
            {"name": "日用百货", "emoji": "🧻"},
            {"name": "服饰", "emoji": "👕"},
            {"name": "数码配件", "emoji": "🎧"},
            {"name": "美妆护肤", "emoji": "💄"},
        ],
    },
    {
        "name": "居住",
        "emoji": "🏠",
        "kind": "expense",
        "color": "#6366F1",
        "children": [
            {"name": "房租", "emoji": "🏠"},
            {"name": "物业", "emoji": "🧾"},
            {"name": "水电燃气", "emoji": "💡"},
            {"name": "家居", "emoji": "🛋️"},
        ],
    },
    {
        "name": "娱乐",
        "emoji": "🎮",
        "kind": "expense",
        "color": "#8B5CF6",
        "children": [
            {"name": "电影", "emoji": "🎬"},
            {"name": "游戏", "emoji": "🎮"},
            {"name": "演出", "emoji": "🎫"},
        ],
    },
    {
        "name": "医疗",
        "emoji": "💊",
        "kind": "expense",
        "color": "#EF4444",
        "children": [
            {"name": "门诊", "emoji": "🏥"},
            {"name": "药品", "emoji": "💊"},
            {"name": "体检", "emoji": "🩺"},
        ],
    },
    {
        "name": "学习",
        "emoji": "📚",
        "kind": "expense",
        "color": "#14B8A6",
        "children": [
            {"name": "书籍", "emoji": "📚"},
            {"name": "课程", "emoji": "🎓"},
            {"name": "考试", "emoji": "📝"},
        ],
    },
    {
        "name": "通讯",
        "emoji": "📱",
        "kind": "expense",
        "color": "#06B6D4",
        "children": [
            {"name": "话费", "emoji": "📱"},
            {"name": "宽带", "emoji": "🌐"},
            {"name": "会员订阅", "emoji": "📺"},
        ],
    },
    {
        "name": "旅行",
        "emoji": "✈️",
        "kind": "expense",
        "color": "#22C55E",
        "children": [
            {"name": "交通票", "emoji": "🎫"},
            {"name": "住宿", "emoji": "🏨"},
            {"name": "景点门票", "emoji": "🎡"},
        ],
    },
    {
        "name": "宠物",
        "emoji": "🐾",
        "kind": "expense",
        "color": "#A16207",
        "children": [
            {"name": "猫粮狗粮", "emoji": "🍖"},
            {"name": "宠物医疗", "emoji": "🩺"},
        ],
    },
    {
        "name": "人情",
        "emoji": "🎁",
        "kind": "expense",
        "color": "#F43F5E",
        "children": [
            {"name": "礼物", "emoji": "🎁"},
            {"name": "红包支出", "emoji": "🧧"},
        ],
    },
    {"name": "其他", "emoji": "📦", "kind": "expense", "color": "#94A3B8", "children": []},
    {
        "name": "工资",
        "emoji": "💰",
        "kind": "income",
        "color": "#10B981",
        "children": [
            {"name": "月薪", "emoji": "🗓️"},
            {"name": "年终奖", "emoji": "🏆"},
        ],
    },
    {
        "name": "奖金",
        "emoji": "🏆",
        "kind": "income",
        "color": "#059669",
        "children": [
            {"name": "项目奖", "emoji": "🎯"},
            {"name": "绩效奖", "emoji": "📈"},
        ],
    },
    {
        "name": "理财",
        "emoji": "📈",
        "kind": "income",
        "color": "#0D9488",
        "children": [
            {"name": "利息", "emoji": "🏦"},
            {"name": "基金股票", "emoji": "📊"},
        ],
    },
    {
        "name": "兼职",
        "emoji": "💼",
        "kind": "income",
        "color": "#65A30D",
        "children": [
            {"name": "外包", "emoji": "🧑‍💻"},
            {"name": "副业", "emoji": "🛠️"},
        ],
    },
    {
        "name": "红包",
        "emoji": "🧧",
        "kind": "income",
        "color": "#DC2626",
        "children": [
            {"name": "节日红包", "emoji": "🎊"},
            {"name": "礼金", "emoji": "🎉"},
        ],
    },
    {"name": "其他", "emoji": "💵", "kind": "income", "color": "#64748B", "children": []},
]
