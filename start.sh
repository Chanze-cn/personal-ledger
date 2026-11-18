#!/usr/bin/env bash
# Ledger 一键启动脚本：安装依赖、构建前端（如缺失）、启动单端口服务
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8899}"
HOST="${HOST:-127.0.0.1}"

if [ ! -d .venv ]; then
  echo "==> 创建 Python 虚拟环境"
  python3 -m venv .venv
fi

echo "==> 检查后端依赖"
.venv/bin/python -m pip install -q -r backend/requirements.txt

if [ ! -f frontend/dist/index.html ]; then
  echo "==> 构建前端"
  (cd frontend && npm install --no-audit --no-fund && npm run build)
fi

echo "==> 启动服务：http://${HOST}:${PORT}"
cd backend
exec ../.venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
