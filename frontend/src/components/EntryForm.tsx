import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { addDays, todayISO } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { Category, Transaction } from '../lib/types';
import { Button, Segmented, useToast } from './ui';

const QUICK_DATES = [
  { label: '今天', offset: 0 },
  { label: '昨天', offset: -1 },
  { label: '前天', offset: -2 },
];

/**
 * 记账表单：整页「快速记账」与 ⌘K 弹窗共用同一套状态与提交逻辑，
 * 提交后只等待 HTTP 返回，切片重算交给后台异步任务，不阻塞用户。
 */
export function EntryForm({
  initial,
  onSaved,
  onCancel,
  autoFocus = true,
}: {
  initial?: Transaction | null;
  onSaved?: (txn: Transaction | null) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const toast = useToast();
  const categoriesQuery = useQuery(() => api.categories(), []);
  const [kind, setKind] = useState<'expense' | 'income'>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null);
  const [date, setDate] = useState(initial?.occurred_on ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  const categories: Category[] = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.kind === kind),
    [categoriesQuery.data, kind],
  );

  useEffect(() => {
    if (categories.length > 0 && !categories.some((item) => item.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
    if (categories.length === 0) setCategoryId(null);
  }, [categories, categoryId]);

  const submit = async () => {
    const value = Number(amount);
    if (!categoryId) {
      toast.push('先选一个品类', 'error');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.push('请输入有效金额', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category_id: categoryId,
        amount: Number(value.toFixed(2)),
        occurred_on: date,
        note: note.trim(),
      };
      const result = initial
        ? await api.updateTransaction(initial.id, payload)
        : await api.createTransaction(payload);
      toast.push(initial ? '流水已更新，切片正在后台重算' : '记账成功，切片正在后台重算');
      onSaved?.(result.transaction);
      if (!initial) {
        setAmount('');
        setNote('');
      }
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={kind}
          onChange={(next) => {
            setKind(next);
            setCategoryId(null);
          }}
          options={[
            { value: 'expense', label: '支出' },
            { value: 'income', label: '收入' },
          ]}
        />
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Sparkles size={13} />
          emoji 品类，两秒记完
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium text-slate-400">¥</span>
          <input
            autoFocus={autoFocus}
            value={amount}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, '');
              if (/^\d*\.?\d{0,2}$/.test(next)) setAmount(next);
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="tnum w-full bg-transparent text-[34px] font-semibold leading-tight tracking-tight text-ink outline-none placeholder:text-slate-300"
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">选择品类</span>
          {categoriesQuery.loading ? (
            <Loader2 size={13} className="animate-spin text-slate-400" />
          ) : (
            <Link to="/app/categories" className="text-[11px] text-indigo-600 hover:text-indigo-700">
              管理品类
            </Link>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {categories.map((category) => {
            const active = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={`group flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 transition duration-200 ${
                  active
                    ? 'border-transparent bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200'
                    : 'border-slate-100 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-sm'
                }`}
              >
                <span className="text-xl leading-none transition group-hover:scale-110">
                  {category.emoji}
                </span>
                <span className="w-full truncate text-center text-[11px] font-medium">
                  {category.name}
                </span>
              </button>
            );
          })}
          {!categoriesQuery.loading && categories.length === 0 && (
            <p className="col-span-4 py-4 text-center text-xs text-slate-400 sm:col-span-6">
              还没有{categoriesQuery.data ? '' : '加载到'}
              品类，请先到「品类管理」创建
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">日期</label>
          <div className="relative">
            <CalendarDays
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field pl-9"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {QUICK_DATES.map((item) => {
              const value = addDays(todayISO(), item.offset);
              const active = value === date;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setDate(value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label">备注（可选）</label>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 60))}
            placeholder="例如：公司楼下的麻辣烫"
            className="field"
          />
          <p className="mt-2 text-[11px] text-slate-400">⌘ / Ctrl + Enter 快速保存</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        )}
        <Button loading={saving} onClick={submit} className="min-w-[132px]">
          {!saving && <Check size={16} />}
          {initial ? '保存修改' : '保存这一笔'}
        </Button>
      </div>
    </div>
  );
}
