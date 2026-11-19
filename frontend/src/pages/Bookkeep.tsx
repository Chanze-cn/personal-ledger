import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ReceiptText, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { dayLabel, money } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { Dashboard } from '../lib/types';
import { Card, EmptyState, PageHeader, useToast } from '../components/ui';
import { EntryForm } from '../components/EntryForm';
import { useQuickEntry } from '../components/QuickEntry';

export default function Bookkeep() {
  const { version, bump } = useQuickEntry();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const { data } = useQuery<Dashboard>(() => api.dashboard(), [version, tick]);

  const refresh = () => setTick((value) => value + 1);

  const remove = async (id: number) => {
    try {
      await api.deleteTransaction(id);
      toast.push('已删除，统计正在后台重算');
      bump();
      refresh();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const month = data?.month;

  return (
    <div>
      <PageHeader
        title="快速记账"
        desc="选个品类，记下这一笔；保存后切片在后台自动重算"
        actions={
          <Link to="/app/transactions" className="btn btn-ghost">
            查看全部流水
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <Card className="p-6">
          <EntryForm
            onSaved={() => {
              bump();
              refresh();
            }}
          />
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">本月概况</p>
                <p className="mt-0.5 text-xs text-slate-400">直接读取流水，实时准确</p>
              </div>
              <CalendarDays size={16} className="text-slate-300" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[11px] text-emerald-700/70">收入</p>
                <p className="tnum mt-1 text-[15px] font-semibold text-income">
                  {money(month?.income ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50/60 px-3 py-2.5">
                <p className="text-[11px] text-rose-600/70">支出</p>
                <p className="tnum mt-1 text-[15px] font-semibold text-expense">
                  {money(month?.expense ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-500">结余</p>
                <p className="tnum mt-1 text-[15px] font-semibold text-ink">
                  {money(month?.net ?? 0)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11.5px] text-slate-400">
              <span>{month?.txn_count ?? 0} 笔流水</span>
              <span>日均支出 {money(month?.avg_daily_expense ?? 0)}</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">最近记录</p>
                <p className="mt-0.5 text-xs text-slate-400">点击右侧图标可删除</p>
              </div>
              <Link to="/app/transactions" className="text-xs text-indigo-600 hover:text-indigo-700">
                全部
              </Link>
            </div>
            {data && data.recent.length > 0 ? (
              <div className="mt-3 divide-y divide-slate-100">
                {data.recent.map((txn) => (
                  <div key={txn.id} className="group flex items-center gap-2.5 py-2.5">
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
                        {txn.category_parent_name
                          ? `${txn.category_parent_name} › ${txn.category_name}`
                          : txn.category_name}{' '}
                        · {dayLabel(txn.occurred_on, false)}
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
                    <button
                      type="button"
                      onClick={() => remove(txn.id)}
                      className="rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState emoji="🧾" title="暂无记录" desc="左边记一笔就会出现在这里" />
            )}
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white/60 px-3.5 py-3 text-[11.5px] leading-5 text-slate-500">
            <ReceiptText size={13} className="mt-0.5 shrink-0 text-indigo-500" />
            提交不会等待切片算完：记账立即返回，重算任务在后台执行，可在任务中心查看进度。
          </div>
        </div>
      </div>
    </div>
  );
}
