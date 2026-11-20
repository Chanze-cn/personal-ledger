"""数据库连接与会话管理（SQLite WAL + 进程内写锁）。"""

from __future__ import annotations

import threading
from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session, sessionmaker

from .config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30} if _is_sqlite else {},
    pool_pre_ping=True,
    future=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _record):
    if not _is_sqlite:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

# SQLite 单写者模型：用进程内写锁避免多线程写入时的 database is locked
WRITE_LOCK = threading.RLock()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 两级品类改造：旧库的 categories 需要新增 parent_id 并去掉「全用户唯一」表约束。
# SQLite 不支持删除表级约束，因此采用「建新表 → 拷贝 → 替换」，历史品类自动成为一级品类。
_CATEGORY_V2_TABLE = """
CREATE TABLE categories_new (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER,
    name VARCHAR(32) NOT NULL,
    emoji VARCHAR(8) NOT NULL,
    kind VARCHAR(8) NOT NULL,
    color VARCHAR(16) NOT NULL,
    sort_order INTEGER NOT NULL,
    is_archived BOOLEAN NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)
"""


def ensure_schema() -> None:
    """启动时做最小的结构迁移，保证新旧数据库都能跑同一份代码。"""
    if not _is_sqlite:
        # External databases use a real migration tool in deployment; the
        # SQLite table-rebuild compatibility path must never run there.
        return
    inspector = inspect(engine)
    if not inspector.has_table("categories"):
        return
    columns = {column["name"] for column in inspector.get_columns("categories")}
    if "parent_id" in columns:
        return

    raw = engine.raw_connection()
    try:
        cursor = raw.cursor()
        raw.rollback()
        # PRAGMA 必须在事务外执行，否则会被忽略
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute(_CATEGORY_V2_TABLE)
        cursor.execute(
            "INSERT INTO categories_new "
            "(id, user_id, parent_id, name, emoji, kind, color, sort_order, is_archived, created_at) "
            "SELECT id, user_id, NULL, name, emoji, kind, color, sort_order, is_archived, created_at "
            "FROM categories"
        )
        cursor.execute("DROP TABLE categories")
        cursor.execute("ALTER TABLE categories_new RENAME TO categories")
        cursor.execute("CREATE INDEX ix_category_user_parent ON categories (user_id, parent_id)")
        cursor.execute("CREATE INDEX ix_category_user_kind ON categories (user_id, kind)")
        raw.commit()
        cursor.execute("PRAGMA foreign_keys=ON")
    except Exception:
        raw.rollback()
        raise
    finally:
        raw.close()
