# Ledger · 流水驱动的记账与预算系统

一个本地可部署的个人记账系统：emoji 快速记账、周/月/年报表、**总预算 + 品类子预算**两级预算，
所有统计都由流水派生出的日 / 周 / 月 / 年**切片**计算，支持异步重算与任务运营观测。
登录与改密全程**加密传输**，网络链路上不出现明文密码。

- 后端：Python 3.11+ · FastAPI · SQLAlchemy 2 · SQLite（WAL）· cryptography
- 前端：React 18 · TypeScript · Vite · TailwindCSS · Recharts
- 认证：PBKDF2-SHA256（260k 迭代）+ HS256 JWT；凭据用 RSA-OAEP + AES-256-GCM 混合加密

## 快速开始

```bash
./start.sh          # 安装依赖 + 构建前端（首次）+ 启动服务
# 打开 http://127.0.0.1:8899
```

初始账号：`chanzezheng` / `123456`（仅创建该账号与一套默认品类，不生成流水、预算等业务数据）

也可以分步启动：

```bash
# 后端（端口 8899，同时托管前端构建产物）
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cd backend && ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8899

# 前端（开发模式，代理 /api 到 8899）
cd frontend && npm install && npm run dev
```

> WebCrypto 只在安全上下文可用：请用 `http://localhost` / `http://127.0.0.1` 或 HTTPS 访问，
> 直接使用局域网明文 IP 时浏览器会禁用加密能力并拦截登录。

## 目录结构

```
backend/
  app/
    main.py               # 入口：建表、初始化账号、加密组件、定时调度、托管前端
    models.py             # users / auth_nonces / categories / transactions / rollup_* / budgets / job_runs
    crypto_transport.py   # RSA-OAEP + AES-GCM 混合加密与一次性握手
    security.py           # 密码哈希与 JWT
    routers/              # auth · categories · transactions · stats · budgets · jobs · system
    services/
      rollup.py           # 切片重算（日 / 周 / 月 / 年）
      jobs.py             # 线程池任务队列 + 运行记录 + 启动校准 + 补偿巡检
      scheduler.py        # 每日切片 + 每 15 分钟补偿
      stats.py            # 看板、趋势、报表、切片浏览
      budgets.py          # 两级预算窗口与执行进度
  data/                   # SQLite 数据文件与 RSA 私钥（首次启动自动创建）
frontend/
  src/pages/              # Landing / Docs / Login / Dashboard / Bookkeep / Transactions
                          # Reports / Budgets / Categories / Jobs / Settings
  src/components/         # AppShell · QuickEntry(⌘K) · EntryForm · CursorGlow · ChartBits · ui
```

## 关键设计

**流水是唯一事实来源。** 统计只读切片，切片可以随时从流水重建。

| 表 | 作用 |
| --- | --- |
| `transactions` | 流水明细（金额按「分」存储） |
| `rollup_daily` | 日切片：日期 × 品类 × 收支方向 |
| `rollup_period` | 周 / 月 / 年切片 |
| `budgets` | 预算定义（`parent_id` 实现总预算与品类子预算的层级） |
| `job_runs` | 异步任务运行记录（进度百分比、阶段说明、耗时） |
| `auth_nonces` | 登录握手的一次性随机串 |

**两级预算。** 总预算不绑品类，约束周期内全部收支；品类子预算挂在总预算下并继承其周期。
总预算的**生效额度 = max(填写额度, 子预算额度合计)**，子预算合计更大时卡片会提示并按合计执行。
已用金额直接扫描流水统计，不受异步切片延迟影响。

**异步重算。** 新增/编辑/删除流水都会提交一次重算任务，从受影响日期起刷新日切片并级联刷新周 / 月 / 年。
前端写入不等待任务完成，任务中心提供进度回合与失败原因；失败可一键全量重建。
每天 00:05 定时切片，另有每 15 分钟巡检补偿，避免漏算。

**凭据加密传输。** `GET /api/auth/handshake` 下发 RSA 公钥与一次性 nonce；
客户端用随机 AES-256-GCM 密钥加密 `{nonce, ts, username, password}`，再用 RSA-OAEP(SHA-256) 包裹该密钥提交；
服务端解密并校验密钥指纹、时间窗（±5 分钟）与 nonce 一次性，之后才走 PBKDF2 校验。

**多用户隔离**：除握手与登录外全部接口在服务端强制附加 `user_id` 条件；品类、预算、任务同样按账号隔离。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8899` | `start.sh` 使用的端口 |
| `LEDGER_DATA_DIR` | `backend/data` | 数据目录 |
| `LEDGER_DATABASE_URL` | `sqlite:///backend/data/ledger.db` | 数据库连接 |
| `LEDGER_SECRET_KEY` | 本地默认值 | JWT 签名密钥（部署请务必覆盖） |
| `LEDGER_AUTH_KEY_PATH` | `backend/data/auth_key.pem` | 传输加密 RSA 私钥路径 |
| `LEDGER_NONCE_TTL_SECONDS` | `120` | 握手 nonce 有效期 |
| `LEDGER_REQUEST_TS_WINDOW_SECONDS` | `300` | 加密请求时间窗 |
| `LEDGER_SEED_USERNAME` / `LEDGER_SEED_PASSWORD` | `chanzezheng` / `123456` | 初始账号 |
| `LEDGER_DAILY_JOB_HOUR` / `LEDGER_DAILY_JOB_MINUTE` | `0` / `5` | 日切片执行时间 |
| `LEDGER_CATCHUP_INTERVAL_MINUTES` | `15` | 补偿巡检间隔 |

## 接口文档

启动后访问 `/api/docs`（Swagger UI），前端站内文档在 `/docs`。

## 说明

- 首次启动只创建初始账号与默认品类，不写入流水或预算。
- 想快速体验报表效果，可在「设置 → 数据管理」点击「生成示例数据」（40 天模拟流水，可随时清空）。
