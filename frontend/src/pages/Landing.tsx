import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Command,
  Database,
  Fingerprint,
  Layers,
  PlusCircle,
  Target,
  Timer,
  Wand2,
} from 'lucide-react';
import { CursorGlow } from '../components/CursorGlow';

const FEATURES = [
  {
    icon: PlusCircle,
    title: '两秒记一笔',
    desc: 'emoji 品类九宫格 + 大额输入，⌘K 随时唤起；整页记账与弹窗共用同一套逻辑。',
  },
  {
    icon: Target,
    title: '总预算 + 品类子预算',
    desc: '一份总预算下挂品类小预算，品类合计超过总预算时自动按较大值执行并给出提示。',
  },
  {
    icon: Layers,
    title: '流水派生切片',
    desc: '日 / 周 / 月 / 年切片全部由流水推导，编辑历史记录会级联重算，报表永不失真。',
  },
  {
    icon: BarChart3,
    title: '报表看得懂',
    desc: '环比、同比、星期分布、日历热力图与品类排行，一屏看完钱的来路与去处。',
  },
  {
    icon: Timer,
    title: '任务可观测',
    desc: '每次重算都是一个可查的异步任务：进度百分比、阶段说明、耗时与失败原因。',
  },
  {
    icon: Fingerprint,
    title: '凭据加密传输',
    desc: '登录与改密走 RSA-OAEP + AES-256-GCM 混合加密，配一次性 nonce 防重放。',
  },
];

const STEPS = [
  { title: '记一笔', desc: '选品类、输金额，切片在后台重算' },
  { title: '看趋势', desc: '日 / 周 / 月 / 年趋势与品类构成' },
  { title: '控预算', desc: '总预算约束大盘，子预算管住细节' },
];

export default function Landing() {
  return (
    <div className="dark-surface relative min-h-screen overflow-hidden bg-[#070a12] text-slate-300">
      <CursorGlow dark />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 0%, rgba(99,102,241,.26), transparent 42%), radial-gradient(circle at 85% 15%, rgba(16,185,129,.12), transparent 42%)',
        }}
      />

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-sm font-bold text-white">
              L
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">Ledger</span>
          </Link>
          <nav className="flex items-center gap-2 text-[13px]">
            <Link
              to="/docs"
              className="rounded-lg px-3 py-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              文档
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 font-medium text-ink transition hover:bg-slate-100"
            >
              进入账本
              <ArrowRight size={14} />
            </Link>
          </nav>
        </header>

        <section className="mx-auto w-full max-w-6xl px-5 pb-8 pt-10 sm:pt-16">
          <span className="chip border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
            <Wand2 size={12} />
            流水驱动的个人账本
          </span>
          <h1 className="mt-5 max-w-3xl text-[38px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[52px]">
            记好每一笔，
            <br className="hidden sm:block" />
            看懂每一分。
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-400">
            所有统计都由流水派生出的切片计算，支持异步重算与任务观测。
            预算是「总预算 + 品类子预算」两级结构，登录凭据全程加密传输。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
            >
              开始记账
              <ArrowRight size={15} className="transition group-hover:translate-x-1" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06]"
            >
              查看使用文档
            </Link>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <Command size={12} />⌘K 随时随地记一笔
            </span>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur"
              >
                <span className="text-[11px] font-medium text-indigo-300">
                  0{index + 1}
                </span>
                <p className="mt-2 text-[15px] font-medium text-white">{step.title}</p>
                <p className="mt-1 text-[12.5px] leading-6 text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-14">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-white/[0.07] bg-[#0b1120]/60 p-5 transition hover:-translate-y-0.5 hover:border-indigo-400/30 hover:bg-[#0b1120]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300 transition group-hover:bg-indigo-500/20">
                  <feature.icon size={16} />
                </span>
                <p className="mt-3.5 text-[14.5px] font-medium text-white">{feature.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-6 text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-16">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[26px] border border-white/[0.08] bg-gradient-to-br from-indigo-500/[0.12] to-emerald-500/[0.06] p-7 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-[12px] text-indigo-300">
                <Database size={13} />
                本地部署 · SQLite · 单端口
              </p>
              <p className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                你的数据，只属于你。
              </p>
              <p className="mt-1.5 max-w-lg text-[12.5px] leading-6 text-slate-400">
                Python + FastAPI 后端托管前端构建产物，一条命令即可跑在 127.0.0.1。
                多用户隔离、品类/预算/任务全部按账号分区。
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-ink transition hover:bg-slate-100"
            >
              打开账本
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/[0.06] py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-[11.5px] text-slate-500">
            <span>© 2026 Ledger · 本地部署版</span>
            <span className="flex items-center gap-4">
              <Link to="/docs" className="transition hover:text-slate-300">
                使用文档
              </Link>
              <a href="/api/docs" className="transition hover:text-slate-300">
                接口文档
              </a>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
