import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  PlusCircle,
  ReceiptText,
  Repeat,
  Settings,
  Sparkles,
  Tags,
  Target,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../lib/hooks';
import { api } from '../lib/api';
import { CursorGlow } from './CursorGlow';
import { QuickEntryProvider, useQuickEntry } from './QuickEntry';

const NAV_ITEMS = [
  { to: '/app', label: '总览', icon: LayoutDashboard, end: true },
  { to: '/app/bookkeep', label: '快速记账', icon: PlusCircle },
  { to: '/app/transactions', label: '流水明细', icon: ReceiptText },
  { to: '/app/recurring', label: '周期流水', icon: Repeat },
  { to: '/app/reports', label: '报表分析', icon: BarChart3 },
  { to: '/app/budgets', label: '预算管理', icon: Target },
  { to: '/app/categories', label: '品类管理', icon: Tags },
  { to: '/app/jobs', label: '任务中心', icon: Activity },
  { to: '/app/settings', label: '设置', icon: Settings },
];

export function AppShell() {
  return (
    <QuickEntryProvider>
      <ShellLayout />
    </QuickEntryProvider>
  );
}

function ShellLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const quickEntry = useQuickEntry();
  const [drawer, setDrawer] = useState(false);
  const system = useQuery(() => api.systemInfo(), [quickEntry.version]);

  const sidebar = (
    <div className="flex h-full flex-col gap-5 px-4 py-6">
      <NavLink to="/" className="group flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,.9)] transition group-hover:scale-105">
          L
        </span>
        <span>
          <span className="block text-[15px] font-semibold leading-tight tracking-tight text-ink">
            Ledger
          </span>
          <span className="text-[11px] text-slate-400">流水驱动的记账</span>
        </span>
      </NavLink>

      <button
        type="button"
        onClick={() => {
          quickEntry.open();
          setDrawer(false);
        }}
        className="group flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white transition hover:bg-[#182238] active:scale-[.985]"
      >
        <span className="flex items-center gap-2">
          <Plus size={16} className="transition group-hover:rotate-90" />
          记一笔
        </span>
        <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/70">
          ⌘K
        </kbd>
      </button>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setDrawer(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
          >
            <item.icon size={17} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-indigo-100/70 bg-gradient-to-br from-indigo-50/90 to-white p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
            <Clock3 size={12} />
            日切片 {system.data?.scheduler.daily_rollup_at ?? '00:05'}
          </div>
          <p className="mt-1 text-[11px] leading-4.5 text-slate-500">
            定时任务每天自动切片；缺少切片时每 {system.data?.scheduler.catchup_every_minutes ?? 15}{' '}
            分钟巡检补算。
          </p>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
            <Sparkles size={10} />
            {system.data
              ? `${system.data.txn_count} 笔流水 / ${system.data.daily_rows} 行日切片`
              : '读取中'}
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white/70 px-2.5 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-base">
            {user?.avatar_emoji || '🙂'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">
              {user?.display_name || user?.username}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {user?.role === 'admin' ? '管理员' : '成员'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-500"
            title="退出登录"
          >
            <LogOut size={15} />
          </button>
        </div>

        <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
          <NavLink to="/docs" className="flex items-center gap-1 transition hover:text-indigo-600">
            <BookOpen size={12} />
            使用文档
          </NavLink>
          <NavLink to="/" className="transition hover:text-indigo-600">
            产品官网
          </NavLink>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-canvas">
      <CursorGlow />
      <div className="relative z-10 flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-slate-200/70 bg-white/55 backdrop-blur-xl lg:block">
          {sidebar}
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 animate-fade bg-ink/40" onClick={() => setDrawer(false)} />
            <div className="relative h-full w-[272px] animate-rise bg-white shadow-float">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/60 bg-canvas/85 px-4 py-3 backdrop-blur-xl lg:hidden">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-white"
            >
              <Menu size={19} />
            </button>
            <span className="text-sm font-semibold tracking-tight">Ledger</span>
            <button
              type="button"
              onClick={() => quickEntry.open()}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white"
            >
              记一笔
            </button>
          </header>

          <main className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
