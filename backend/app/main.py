"""应用入口：建表、启动加密组件与定时调度、托管前端静态资源。"""

from __future__ import annotations

import asyncio
import datetime as dt
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import APP_NAME, APP_TAGLINE, AUTH_KEY_PATH, FRONTEND_DIST
from .clock import now as local_now
from .crypto_transport import TransportCrypto
from .database import engine, ensure_schema
from .models import Base
from .routers import auth, budgets, categories, jobs, recurring, stats, system, transactions
from .services.jobs import schedule_startup_calibration
from .services.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    Base.metadata.create_all(engine)
    app.state.crypto = TransportCrypto(AUTH_KEY_PATH)
    await asyncio.to_thread(schedule_startup_calibration)
    scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()


app = FastAPI(
    title="Ledger API",
    description="以流水为基准的个人记账、预算与报表系统（登录凭据加密传输）。",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8899",
        "http://127.0.0.1:8899",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(categories.router)
api.include_router(transactions.router)
api.include_router(recurring.router)
api.include_router(stats.router)
api.include_router(budgets.router)
api.include_router(jobs.router)
api.include_router(system.router)


@api.get("/health", tags=["system"], summary="健康检查")
def health() -> dict:
    return {"status": "ok", "time": local_now().isoformat(timespec="seconds")}


@api.get("/meta", tags=["system"], summary="公开产品信息")
def meta() -> dict:
    return {
        "app": APP_NAME,
        "tagline": APP_TAGLINE,
        "version": "1.0.0",
        "features": [
            "两级品类 + 常用快捷 + 品类搜索的极速记账（整页 + ⌘K 弹窗）",
            "周 / 月 / 年报表，含环比、同比、星期分布与日历热力",
            "流水驱动的日 / 周 / 月 / 年统计切片",
            "总预算 + 品类子预算的两级预算体系",
            "登录凭据 RSA-OAEP + AES-GCM 加密传输",
            "多账号注册与数据隔离",
            "异步任务中心与全量重建",
        ],
    }


app.include_router(api)

assets_dir = FRONTEND_DIST / "assets"
if assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    target = FRONTEND_DIST / full_path if full_path else None
    if target and target.is_file():
        return FileResponse(target)
    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return JSONResponse(
        {
            "message": "前端尚未构建。开发模式请访问 http://localhost:5173，"
            "或在 frontend 目录执行 npm run build 后刷新。",
            "docs": "/api/docs",
        }
    )
