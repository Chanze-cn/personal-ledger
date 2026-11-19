import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCw,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  money,
  moneyShort,
  shiftMonth,
  shiftWeek,
  shiftYear,
  signedPercent,
  todayISO,
} from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { Report, SliceRow } from '../lib/types';
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

type Period = 'week' | 'month' | 'year';
type Granularity = 'day' | 'week' | 'month' | 'year';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
];

function shiftAnchor(period: Period, anchor: string, delta: number) {
  if (period === 'week') return shiftWeek(anchor, delta);
  if (period === 'month') return shiftMonth(anchor, delta);
  return shiftYear(anchor, delta);
}

export default function Reports() {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(todayISO());
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [rebuilding, setRebuilding] = useState(false);
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleCategory = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, loading } = useQuery<Report>(
    () => api.report(period, anchor),
    [period, anchor, tick],
  );
  const slices = useQuery<SliceRow[]>(
    () => api.slices(granularity, 12),
    [granularity, tick],
  );

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await api.rebuild();
      toast.push('全量重建任务已提交，稍后自动刷新');
      window.setTimeout(() => setTick((value) => value + 1), 1200);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setRebuilding(false);
    }
  };

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setAnchor(todayISO());
  };

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="报表分析" desc="周 / 月 / 年报表，含环比、同比与星期分布" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="card h-[104px]" />
          ))}
        </div>
        <div className="card mt-4 h-[300px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8">
        <EmptyState emoji="📉" title="报表加载失败" desc="请稍后重试" />
      </Card>
    );
  }

  const current = data.current;
  const previous = data.previous;
  const lastYear = data.last_year;
  const maxWeekday = Math.max(...data.weekday.map((item) => item.expense), 1);

  return (
    <div>
      <PageHeader
        title="报表分析"
        desc="数据来自日 / 周 / 月 / 年切片，编辑流水后自动级联重算"
        actions={
          <Segmented value={period} onChange={changePeriod} options={PERIODS} />
        }
      />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnchor((value) => shiftAnchor(period, value, -1))}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-[128px] text-center text-[14px] font-medium text-ink">
            {data.label}
          </span>
          <button
            type="button"
            onClick={() => setAnchor((value) => shiftAnchor(period, value, 1))}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(todayISO())}
            className="ml-1 rounded-lg px-2.5 py-1 text-[12px] text-indigo-600 transition hover:bg-indigo-50"
          >
            回到本期
          </button>
        </div>
        <span className="text-[11.5px] text-slate-400">
          {data.start} ~ {data.end} · 上一期 {data.previous_label}
        </span>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat
          label="本期收入"
          value={current.income}
          previous={previous.income}
          lastYear={lastYear.income}
          tone="income"
        />
        <ReportStat
          label="本期支出"
          value={current.expense}
          previous={previous.expense}
          lastYear={lastYear.expense}
          tone="expense"
        />
        <ReportStat
          label="本期结余"
          value={current.net}
          previous={previous.net}
          lastYear={lastYear.net}
          tone="brand"
        />
        <StatCard
          label="记账笔数"
          value={`${current.txn_count} 笔`}
          icon={<Layers size={16} />}
          hint={`${current.active_days} 天有支出 · 上期 ${previous.txn_count} 笔`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink">收支趋势</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {period === 'year' ? '按月聚合' : '逐日明细'} · {data.points.length} 个数据点
              </p>
            </div>
            <div className="text-right text-[11.5px] text-slate-400">
              <p>
                日均支出 <b className="text-slate-600">{money(data.insight.avg_daily_expense)}</b>
              </p>
              <p className="mt-0.5">
                最高单日{' '}
                <b className="text-slate-600">
                  {data.insight.top_day
                    ? `${data.insight.top_day.slice(5)} · ${money(data.insight.top_day_amount)}`
                    : '—'}
                </b>
              </p>
            </div>
          </div>
          <div className="mt-4 h-[260px] w-full">
            {data.points.every((point) => point.expense === 0 && point.income === 0) ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-50/60">
                <span className="text-2xl">📈</span>
                <p className="text-[12.5px] text-slate-500">本期还没有流水</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.points} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reportExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="reportIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    interval={Math.max(0, Math.floor(data.points.length / 7))}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    tickFormatter={(value: number) => moneyShort(value)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name="支出"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#reportExpense)"
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="收入"
                    stroke="#10b981"
                    strokeWidth={1.6}
                    fill="url(#reportIncome)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div>
            <p className="text-sm font-medium text-ink">星期分布</p>
            <p className="mt-0.5 text-xs text-slate-400">看你的钱主要花在哪几天</p>
          </div>
          <div className="mt-4 h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weekday} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(value: number) => moneyShort(value)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,.06)' }} />
                <Bar dataKey="expense" name="支出" radius={[5, 5, 0, 0]} fill="#c7d2fe">
                  {data.weekday.map((item) => (
                    <Cell
                      key={item.label}
                      fill={item.expense === maxWeekday ? '#6366f1' : '#c7d2fe'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {period === 'month' && data.calendar.length > 0 && (
        <Card className="mt-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">日历热力</p>
              <p className="mt-0.5 text-xs text-slate-400">颜色越深，当天支出越高</p>
            </div>
            <span className="text-[11px] text-slate-400">峰值 {money(data.insight.top_day_amount)}</span>
          </div>
          <div className="mx-auto mt-4 grid max-w-[520px] grid-cols-7 gap-1.5">
            {['一', '二', '三', '四', '五', '六', '日'].map((label) => (
              <div key={label} className="pb-1 text-center text-[10.5px] text-slate-400">
                {label}
              </div>
            ))}
            {Array.from({ length: data.calendar[0]?.weekday ?? 0 }).map((_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {data.calendar.map((day) => (
              <div
                key={day.date}
                title={`${day.date} · ${money(day.expense)}`}
                className="flex aspect-square flex-col items-center justify-center rounded-lg border border-white/60 text-[10.5px] transition hover:scale-[1.04]"
                style={{
                  background:
                    day.intensity > 0
                      ? `rgba(99, 102, 241, ${0.08 + day.intensity * 0.72})`
                      : '#f8fafc',
                  color: day.intensity > 0.55 ? '#fff' : '#64748b',
                }}
              >
                <span className="font-medium">{Number(day.date.slice(8))}</span>
                {day.expense > 0 && (
                  <span className="tnum text-[9px] opacity-80">
                    {day.expense >= 1000
                      ? `${(day.expense / 1000).toFixed(1)}k`
                      : Math.round(day.expense)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-ink">支出构成</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {data.categories.length} 个一级品类 · 可展开看子品类 · 含环比变化
              </p>
            </div>
          </div>
          {data.categories.length === 0 ? (
            <EmptyState emoji="🥧" title="本期暂无支出" />
          ) : (
            <div className="mt-4 space-y-3">
              {data.categories.slice(0, 8).map((item) => {
                const children = item.children ?? [];
                const open = expanded.has(item.id);
                return (
                  <div key={item.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => children.length > 0 && toggleCategory(item.id)}
                        className={`flex min-w-0 items-center gap-2 text-left ${
                          children.length > 0 ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        {children.length > 0 ? (
                          <ChevronDown
                            size={12}
                            className={`shrink-0 text-slate-400 transition ${
                              open ? '' : '-rotate-90'
                            }`}
                          />
                        ) : (
                          <span className="w-3 shrink-0" />
                        )}
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-50 text-[12px]">
                          {item.emoji}
                        </span>
                        <span className="truncate text-[12.5px] text-slate-600">{item.name}</span>
                        <span className="text-[10.5px] text-slate-400">{item.share}%</span>
                        {children.length > 0 && (
                          <span className="chip bg-slate-100 text-[9.5px] text-slate-500">
                            {children.length} 子项
                          </span>
                        )}
                      </button>
                      <span className="flex shrink-0 items-center gap-2">
                        {typeof item.delta === 'number' && (
                          <span
                            className={`text-[10.5px] ${
                              item.delta > 0 ? 'text-rose-500' : 'text-emerald-600'
                            }`}
                          >
                            {signedPercent(item.delta)}
                          </span>
                        )}
                        <span className="tnum text-[12px] font-medium text-ink">
                          {money(item.amount)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(2, item.share)}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                    {open && children.length > 0 && (
                      <div className="mt-1.5 space-y-1 border-l border-slate-100 pl-5">
                        {children.map((child) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between gap-2 text-[11.5px] text-slate-500"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="text-[11px]">{child.emoji}</span>
                              <span className="truncate">{child.name}</span>
                            </span>
                            <span className="tnum shrink-0">
                              {money(child.amount)}
                              <span className="ml-1.5 text-slate-400">{child.share}%</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">统计切片</p>
              <p className="mt-0.5 text-xs text-slate-400">预聚合数据，最近 12 期</p>
            </div>
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                value={granularity}
                onChange={setGranularity}
                options={GRANULARITIES}
              />
              <button
                type="button"
                onClick={rebuild}
                disabled={rebuilding}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
                title="全量重建切片"
              >
                <RotateCw size={14} className={rebuilding ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="mt-4">
            {slices.data && slices.data.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {slices.data.map((slice) => {
                  const max = Math.max(slice.total_expense, slice.total_income, 1);
                  return (
                    <div key={slice.period_key} className="py-2">
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-mono text-slate-500">{slice.period_key}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-income">+{money(slice.total_income)}</span>
                          <span className="text-expense">-{money(slice.total_expense)}</span>
                          <span className="text-slate-400">{slice.txn_count} 笔</span>
                        </span>
                      </div>
                      <div className="mt-1 flex gap-1">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-400/70"
                            style={{ width: `${(slice.total_income / max) * 100}%` }}
                          />
                        </div>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-400/80"
                            style={{ width: `${(slice.total_expense / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                emoji="🧱"
                title="还没有切片"
                desc="记一笔或点击右上角重建按钮"
                action={<Button onClick={rebuild}>全量重建</Button>}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <InsightCard
          label="支出环比"
          value={data.insight.expense_delta}
          previousLabel={data.previous_label}
          positiveIsBad
        />
        <InsightCard label="收入环比" value={data.insight.income_delta} previousLabel={data.previous_label} />
        <Card className="p-5">
          <p className="text-[12px] text-slate-500">最大支出品类</p>
          <p className="mt-2 text-[18px] font-semibold tracking-tight text-ink">
            {data.insight.top_category ?? '—'}
          </p>
          <p className="mt-1 text-[11.5px] text-slate-400">
            同比去年支出 {money(lastYear.expense)}
          </p>
        </Card>
      </div>
    </div>
  );
}

function ReportStat({
  label,
  value,
  previous,
  lastYear,
  tone,
}: {
  label: string;
  value: number;
  previous: number;
  lastYear: number;
  tone: 'income' | 'expense' | 'brand';
}) {
  const delta = previous ? ((value - previous) / previous) * 100 : null;
  const yearDelta = lastYear ? ((value - lastYear) / lastYear) * 100 : null;
  const bad = tone === 'expense' ? (delta ?? 0) > 0 : (delta ?? 0) < 0;

  return (
    <StatCard
      label={label}
      value={money(value)}
      tone={tone}
      trend={
        delta === null ? (
          <span className="chip bg-slate-100 text-slate-500">首期</span>
        ) : (
          <span
            className={`chip ${
              bad ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {signedPercent(delta)}
          </span>
        )
      }
      hint={yearDelta === null ? '暂无同比' : `同比 ${signedPercent(yearDelta)}`}
    />
  );
}

function InsightCard({
  label,
  value,
  previousLabel,
  positiveIsBad = false,
}: {
  label: string;
  value: number | null;
  previousLabel: string;
  positiveIsBad?: boolean;
}) {
  const positive = (value ?? 0) > 0;
  const bad = positiveIsBad ? positive : !positive;
  return (
    <Card className="p-5">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p
        className={`mt-2 text-[18px] font-semibold tracking-tight ${
          value === null ? 'text-slate-400' : bad ? 'text-expense' : 'text-income'
        }`}
      >
        {signedPercent(value)}
      </p>
      <p className="mt-1 text-[11.5px] text-slate-400">对比 {previousLabel}</p>
      {value !== null && (
        <div className="mt-3">
          <Progress
            value={Math.min(100, Math.abs(value))}
            tone={bad ? 'expense' : 'income'}
            height="h-1.5"
          />
        </div>
      )}
    </Card>
  );
}
