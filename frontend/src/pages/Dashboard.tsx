import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  PiggyBank,
  Plus,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { dayLabel, money, moneyShort, signedPercent } from '../lib/format';
import { useQuery, waitForJob } from '../lib/hooks';
import type { Dashboard as DashboardData } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  Segmented,
  StatCard,
  useToast,
} from '../components/ui';
import { ChartTooltip } from '../components/ChartBits';
import { useQuickEntry } from '../components/QuickEntry';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 19) return '下午好';
  return '晚上好';
}

export default function Dashboard() {
  const { user } = useAuth();
  const { version, open } = useQuickEntry();
  const toast = useToast();
  const { data, loading, error, reload } = useQuery<DashboardData>(
    () => api.dashboard(),
    [version],
  );
  const [chartMode, setChartMode] = useState<'expense' | 'both'>('expense');
  const [seeding, setSeeding] = useState(false);

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const result = await api.demoData();
      const job = await waitForJob(result.job_id, 25000);
      if (job.status === 'failed') throw new Error(job.message);
      toast.push(`已生成 ${result.created} 笔示例流水`);
      reload();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setSeeding(false);
    }
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error) {
    return (
      <Card className="p-8">
        <EmptyState
          emoji="⚠️"
          title="看板加载失败"
          desc={error}
          action={<Button onClick={reload}>重新加载</Button>}
        />
      </Card>
    );
  }

  if (!data) return null;

  const month = data.month;
  const isEmpty = month.txn_count === 0 && data.recent.length === 0;
  const delta = month.expense_delta;
  const budgetGroups = data.budgets;
  const budgetItems = [...budgetGroups.totals, ...budgetGroups.standalone];

  return (
    <div>
      <PageHeader
        title="总览"
        desc={`${greeting()}，${user?.display_name || user?.username} · 数据截至 ${dayLabel(
          data.meta.today,
          false,
        )}`}
        actions={
          <>
            <Link to="/app/reports" className="btn btn-ghost">
              查看报表
              <ArrowRight size={15} />
            </Link>
            <Button onClick={() => open()}>
              <Plus size={16} />
              记一笔
            </Button>
          </>
        }
      />

      {isEmpty && (
        <Card className="mb-4 overflow-hidden">
          <div className="relative flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-indigo-100/60 blur-3xl" />
            <div className="relative">
              <span className="chip bg-indigo-50 text-indigo-700">
                <Sparkles size={12} />
                第一次使用
              </span>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                从第一笔开始，建立你的现金流视图
              </h2>
              <p className="mt-1.5 max-w-lg text-sm leading-6 text-slate-500">
                记一笔后，系统会自动生成日切片并汇总出周 / 月 / 年统计。想先看看报表效果，也可以一键生成示例数据。
              </p>
            </div>
            <div className="relative flex shrink-0 flex-wrap gap-2">
              <Button onClick={() => open()}>
                <Plus size={15} />
                记第一笔
              </Button>
              <Button variant="ghost" loading={seeding} onClick={seedDemo}>
                生成示例数据
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="本月支出"
          value={money(month.expense)}
          tone="expense"
          icon={<TrendingDown size={16} />}
          trend={
            delta === null ? (
              <span className="chip bg-slate-100 text-slate-500">首月</span>
            ) : (
              <span
                className={`chip ${
                  delta > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {signedPercent(delta)}
              </span>
            )
          }
          hint={delta === null ? '暂无上月对比' : '较上月'}
        />
        <StatCard
          label="本月收入"
          value={money(month.income)}
          tone="income"
          icon={<Wallet size={16} />}
          hint={`${month.txn_count} 笔流水`}
        />
        <StatCard
          label="本月结余"
          value={money(month.net)}
          tone={month.net >= 0 ? 'income' : 'expense'}
          icon={<PiggyBank size={16} />}
          hint={month.income > 0 ? `结余率 ${month.saving_rate.toFixed(1)}%` : '暂无收入'}
        />
        <StatCard
          label="日均支出"
          value={money(month.avg_daily_expense)}
          icon={<CalendarClock size={16} />}
          hint={`${month.active_days} 天有支出记录`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">支出趋势</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {money(month.expense)} · 覆盖 {data.trend.length} 天
              </p>
            </div>
            <Segmented
              size="sm"
              value={chartMode}
              onChange={setChartMode}
              options={[
                { value: 'expense', label: '仅支出' },
                { value: 'both', label: '收支对比' },
              ]}
            />
          </div>
          <div className="mt-4 h-[236px] w-full">
            {data.trend.every((point) => point.expense === 0 && point.income === 0) ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-50/60">
                <span className="text-2xl">📈</span>
                <p className="text-[12.5px] text-slate-500">记一笔后，这里会出现每日支出趋势</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.26} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    interval={Math.max(0, Math.floor(data.trend.length / 6))}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    tickFormatter={(value: number) => moneyShort(value)}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: '#c7d2fe', strokeDasharray: '4 4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name="支出"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#expenseFill)"
                    activeDot={{ r: 3.5, strokeWidth: 2, stroke: '#fff' }}
                  />
                  {chartMode === 'both' && (
                    <Line
                      type="monotone"
                      dataKey="income"
                      name="收入"
                      stroke="#10b981"
                      strokeWidth={1.6}
                      dot={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink">支出构成</p>
              <p className="mt-0.5 text-xs text-slate-400">{data.categories.length} 个品类</p>
            </div>
            <Link to="/app/reports" className="text-xs text-indigo-600 hover:text-indigo-700">
              明细
            </Link>
          </div>

          {data.categories.length === 0 ? (
            <EmptyState emoji="🥧" title="暂无支出" desc="记一笔后这里会出现分类构成" />
          ) : (
            <>
              <div className="relative mx-auto mt-2 h-[168px] w-[168px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.categories}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {data.categories.map((item) => (
                        <Cell key={item.id} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">总支出</span>
                  <span className="tnum text-[15px] font-semibold tracking-tight">
                    {moneyShort(month.expense)}
                  </span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {data.categories.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-50 text-[12px]">
                      {item.emoji}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] text-slate-600">{item.name}</span>
                    <span className="text-[11px] text-slate-400">{item.share}%</span>
                    <span className="tnum text-[12px] font-medium text-ink">
                      {money(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink">预算执行</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {budgetItems.length > 0
                  ? `${budgetItems.length} 个预算 · 其中 ${budgetGroups.summary.child_count} 个品类子预算`
                  : '还没有设置预算'}
              </p>
            </div>
            <Link to="/app/budgets" className="text-xs text-indigo-600 hover:text-indigo-700">
              管理
            </Link>
          </div>

          {budgetItems.length === 0 ? (
            <EmptyState
              emoji="🎯"
              title="用预算控制节奏"
              desc="支持日 / 周 / 月 / 年与自定义周期；一份总预算下可以挂多个品类小预算"
              action={
                <Link to="/app/budgets" className="btn btn-soft">
                  创建预算
                </Link>
              }
            />
          ) : (
            <div className="mt-4 space-y-4">
              {budgetItems.slice(0, 3).map((budget) => {
                const over = budget.ratio >= 100;
                const warn = budget.ratio >= 80;
                return (
                  <div key={budget.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-[14px]">{budget.category_emoji}</span>
                        <span className="truncate text-[13px] font-medium text-slate-700">
                          {budget.name}
                        </span>
                        <span className="chip shrink-0 bg-slate-100 text-[10px] text-slate-500">
                          {budget.period_label}
                        </span>
                        {budget.overridden && (
                          <span className="chip shrink-0 bg-amber-50 text-[10px] text-amber-700">
                            子预算合计生效
                          </span>
                        )}
                      </span>
                      <span className="tnum shrink-0 text-[12px] text-slate-500">
                        <span className={over ? 'font-medium text-rose-600' : 'text-ink'}>
                          {money(budget.used)}
                        </span>
                        {' / '}
                        {money(budget.effective_amount)}
                      </span>
                    </div>
                    <Progress value={budget.ratio} tone={over ? 'expense' : warn ? 'warn' : 'brand'} />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {over
                          ? `已超支 ${money(Math.abs(budget.remaining))}`
                          : `剩余 ${money(budget.remaining)}`}
                      </span>
                      <span>
                        {budget.days_left > 0
                          ? `每天可用 ${money(budget.daily_allowance)}`
                          : '本期已结束'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink">最近流水</p>
              <p className="mt-0.5 text-xs text-slate-400">
                最新 {Math.min(6, data.recent.length)} 笔
              </p>
            </div>
            <Link to="/app/transactions" className="text-xs text-indigo-600 hover:text-indigo-700">
              全部
            </Link>
          </div>

          {data.recent.length === 0 ? (
            <EmptyState
              emoji="🧾"
              title="还没有流水"
              desc="按 ⌘K 记下第一笔"
              action={<Button onClick={() => open()}>记一笔</Button>}
            />
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {data.recent.map((txn) => (
                <div key={txn.id} className="flex items-center gap-2.5 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[14px]"
                    style={{ background: `${txn.category_color}18` }}
                  >
                    {txn.category_emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-slate-700">
                      {txn.note || txn.category_name}
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      {txn.category_name} · {dayLabel(txn.occurred_on, false)}
                    </p>
                  </div>
                  <span
                    className={`tnum shrink-0 text-[12.5px] font-medium ${
                      txn.kind === 'income' ? 'text-income' : 'text-slate-700'
                    }`}
                  >
                    {txn.kind === 'income' ? '+' : '-'}
                    {money(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/60 px-4 py-3 text-[11.5px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-indigo-400" />
          所有统计均由流水派生的切片计算，任务中心今日已完成 {data.jobs.finished_today} 个任务
        </span>
        <Link to="/app/jobs" className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700">
          查看任务
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <div className="skeleton h-7 w-28" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="card p-5">
            <div className="skeleton h-3.5 w-16" />
            <div className="skeleton mt-4 h-7 w-28" />
            <div className="skeleton mt-3 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card h-[320px] lg:col-span-2" />
        <div className="card h-[320px]" />
      </div>
    </div>
  );
}
