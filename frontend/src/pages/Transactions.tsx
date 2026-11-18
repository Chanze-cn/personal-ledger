import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useDebounced, useQuery } from '../lib/hooks';
import type { Transaction } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Segmented,
  useToast,
} from '../components/ui';
import { EntryForm } from '../components/EntryForm';
import { useQuickEntry } from '../components/QuickEntry';

const PAGE_SIZE = 20;

export default function Transactions() {
  const { version, bump } = useQuickEntry();
  const toast = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState<'' | 'expense' | 'income'>('');
  const [categoryId, setCategoryId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = useDebounced(keyword, 350);
  const categoriesQuery = useQuery(() => api.categories(), []);
  const { data, loading, reload } = useQuery(
    () =>
      api.transactions({
        start: start || undefined,
        end: end || undefined,
        kind: kind || undefined,
        category_id: categoryId || undefined,
        q: q || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [start, end, kind, categoryId, q, page, version],
  );

  const reset = () => {
    setStart('');
    setEnd('');
    setKind('');
    setCategoryId('');
    setKeyword('');
    setPage(1);
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteTransaction(pendingDelete.id);
      toast.push('已删除，统计正在后台重算');
      setPendingDelete(null);
      bump();
      reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="流水明细"
        desc="支持日期、类型、品类与备注搜索，编辑会级联重算后续切片"
        actions={
          <Link to="/app/bookkeep" className="btn btn-primary">
            <Plus size={16} />
            记一笔
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              setPage(1);
            }}
            className="field w-auto py-2 text-[13px]"
            title="开始日期"
          />
          <span className="text-xs text-slate-400">至</span>
          <input
            type="date"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              setPage(1);
            }}
            className="field w-auto py-2 text-[13px]"
            title="结束日期"
          />
          <Segmented
            size="sm"
            value={kind}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: '', label: '全部' },
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className="field w-auto py-2 text-[13px]"
          >
            <option value="">全部品类</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji} {category.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="搜索备注…"
              className="field w-44 py-2 pl-8 text-[13px]"
            />
          </div>
          <button type="button" className="btn btn-ghost px-3 py-2 text-[13px]" onClick={reset}>
            <Filter size={14} />
            重置
          </button>
        </div>

        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-slate-500">
            <span>
              共 <b className="text-ink">{total}</b> 条记录
            </span>
            <span>
              支出合计 <b className="text-expense">{money(data.total_expense)}</b>
            </span>
            <span>
              收入合计 <b className="text-income">{money(data.total_income)}</b>
            </span>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton h-9 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="没有符合条件的记录"
            desc="换个筛选条件，或者先去记一笔"
            action={
              <Link to="/app/bookkeep" className="btn btn-soft">
                去记账
              </Link>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11.5px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 text-left font-medium">日期</th>
                    <th className="px-3 py-3 text-left font-medium">品类</th>
                    <th className="px-3 py-3 text-left font-medium">备注</th>
                    <th className="px-3 py-3 text-left font-medium">类型</th>
                    <th className="px-3 py-3 text-right font-medium">金额</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((txn) => (
                    <tr
                      key={txn.id}
                      className="table-row-hover border-b border-slate-50 last:border-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-[12.5px] text-slate-500">
                        {txn.occurred_on}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[13px]"
                            style={{ background: `${txn.category_color}18` }}
                          >
                            {txn.category_emoji}
                          </span>
                          <span className="text-[13px] text-slate-700">{txn.category_name}</span>
                        </span>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-[13px] text-slate-500">
                        {txn.note || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`chip text-[10.5px] ${
                            txn.kind === 'income'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {txn.kind === 'income' ? '收入' : '支出'}
                        </span>
                      </td>
                      <td
                        className={`tnum whitespace-nowrap px-3 py-3 text-right text-[13px] font-medium ${
                          txn.kind === 'income' ? 'text-income' : 'text-slate-700'
                        }`}
                      >
                        {txn.kind === 'income' ? '+' : '-'}
                        {money(txn.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(txn)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                            title="编辑"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(txn)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
              <span>
                第 {page} / {pages} 页
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-[12px]"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-[12px]"
                  disabled={page >= pages}
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="编辑流水"
        subtitle="修改后会自动重算该日期起的日 / 周 / 月 / 年切片"
        width="max-w-2xl"
      >
        {editing && (
          <EntryForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              bump();
              reload();
            }}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这笔流水？"
        subtitle="删除后统计会自动重算，操作不可撤销"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {pendingDelete?.category_emoji} {pendingDelete?.category_name} ·{' '}
          {pendingDelete ? money(pendingDelete.amount) : ''} · {pendingDelete?.occurred_on}
        </p>
      </Modal>
    </div>
  );
}
