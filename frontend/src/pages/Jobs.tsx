import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  RotateCw,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { clockTime, durationLabel, relativeTime } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { JobRun } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  Segmented,
  StatusBadge,
  useToast,
} from '../components/ui';

const FILTERS = [
  { value: '', label: '全部' },
  { value: 'running', label: '进行中' },
  { value: 'success', label: '已完成' },
  { value: 'failed', label: '失败' },
];

export default function Jobs() {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0);

  const jobs = useQuery<JobRun[]>(() => api.jobs(60), [tick]);
  const stats = useQuery(() => api.jobStats(), [tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  const counts = stats.data?.counts ?? {};
  const active = (counts.pending ?? 0) + (counts.running ?? 0);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(reload, 1500);
    return () => window.clearInterval(timer);
  }, [active, reload]);

  const trigger = async (kind: 'daily' | 'rebuild') => {
    setBusy(kind);
    try {
      const result = kind === 'daily' ? await api.dailyRollup() : await api.rebuild();
      toast.push(result.message);
      reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const items = (jobs.data ?? []).filter((job) => {
    if (!filter) return true;
    if (filter === 'running') return job.status === 'pending' || job.status === 'running';
    return job.status === filter;
  });

  const avgDurations = stats.data?.avg_duration_ms ?? {};

  return (
    <div>
      <PageHeader
        title="任务中心"
        desc="切片重算全部异步执行，进度、阶段说明与耗时都可观测"
        actions={
          <>
            <Button variant="ghost" loading={busy === 'daily'} onClick={() => trigger('daily')}>
              <Zap size={15} />
              触发当日切片
            </Button>
            <Button loading={busy === 'rebuild'} onClick={() => trigger('rebuild')}>
              <RotateCw size={15} />
              全量重建
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          icon={<Activity size={16} />}
          label="任务总数"
          value={Object.values(counts).reduce((sum, value) => sum + value, 0)}
          tone="text-ink"
        />
        <SummaryCard
          icon={<Clock size={16} />}
          label="排队中"
          value={counts.pending ?? 0}
          tone="text-amber-600"
        />
        <SummaryCard
          icon={<RotateCw size={16} />}
          label="执行中"
          value={counts.running ?? 0}
          tone="text-indigo-600"
        />
        <SummaryCard
          icon={<CheckCircle2 size={16} />}
          label="已成功"
          value={counts.success ?? 0}
          tone="text-income"
        />
        <SummaryCard
          icon={<XCircle size={16} />}
          label="失败"
          value={counts.failed ?? 0}
          tone="text-expense"
        />
      </div>

      {Object.keys(avgDurations).length > 0 && (
        <Card className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
            <Timer size={12} />
            平均耗时
          </span>
          {Object.entries(avgDurations).map(([label, value]) => (
            <span key={label} className="text-[11.5px] text-slate-500">
              {label} <b className="tnum text-slate-700">{durationLabel(value)}</b>
            </span>
          ))}
        </Card>
      )}

      <div className="mt-4 mb-3 flex items-center justify-between">
        <Segmented value={filter} onChange={setFilter} size="sm" options={FILTERS} />
        <span className="text-[11.5px] text-slate-400">
          {active > 0 ? '有任务进行中，列表每 1.5 秒自动刷新' : `共 ${items.length} 条记录`}
        </span>
      </div>

      <Card className="p-0">
        {jobs.loading && !jobs.data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            emoji="⚙️"
            title="暂无任务"
            desc="记一笔或手动触发重建，即可在这里看到执行记录"
            action={<Button onClick={() => trigger('daily')}>触发当日切片</Button>}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((job) => {
              const percent = Math.round((job.progress ?? 0) * 100);
              const failed = job.status === 'failed';
              return (
                <div key={job.id} className="flex items-start gap-3 px-5 py-4">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      failed
                        ? 'bg-rose-50 text-rose-500'
                        : job.status === 'success'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-indigo-50 text-indigo-600'
                    }`}
                  >
                    {failed ? (
                      <XCircle size={15} />
                    ) : job.status === 'success' ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <RotateCw size={15} className="animate-spin" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-slate-700">
                        {job.name}
                      </span>
                      <StatusBadge status={job.status} />
                      <span className="chip bg-slate-100 text-[9.5px] text-slate-500">
                        {job.job_type}
                      </span>
                      <span className="chip bg-slate-50 text-[9.5px] text-slate-400">
                        {job.trigger === 'schedule'
                          ? '定时'
                          : job.trigger === 'system'
                            ? '系统'
                            : '手动'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1">
                        <Progress
                          value={percent}
                          height="h-1.5"
                          tone={failed ? 'expense' : job.status === 'success' ? 'income' : 'brand'}
                        />
                      </div>
                      <span className="tnum w-9 shrink-0 text-right text-[10.5px] text-slate-400">
                        {percent}%
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-400">
                      <span>#{job.id}</span>
                      <span>创建 {clockTime(job.created_at)}</span>
                      {job.finished_at && <span>结束 {clockTime(job.finished_at)}</span>}
                      {job.duration_ms > 0 && <span>耗时 {durationLabel(job.duration_ms)}</span>}
                      <span>{relativeTime(job.created_at)}</span>
                    </div>

                    {(job.message || job.error) && (
                      <p
                        className={`mt-1.5 truncate text-[11px] ${
                          failed ? 'text-rose-500' : 'text-slate-500'
                        }`}
                        title={job.error || job.message}
                      >
                        {job.error || job.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-slate-500">{label}</span>
        <span className="text-slate-300">{icon}</span>
      </div>
      <p className={`tnum mt-2 text-[22px] font-semibold tracking-tight ${tone}`}>{value}</p>
    </Card>
  );
}
