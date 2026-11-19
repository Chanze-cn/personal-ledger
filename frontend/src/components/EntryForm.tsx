import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Loader2, Search, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { addDays, todayISO } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { Category, Transaction } from '../lib/types';
import { Button, Segmented, useToast } from './ui';

type LeafEntry = { child: Category; parent: Category | null };

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
  const categoriesQuery = useQuery(() => api.categories(false, true), []);
  const amountRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<'expense' | 'income'>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [date, setDate] = useState(initial?.occurred_on ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  /** 一级品类作为分组，二级品类才是记账末级；没有子品类的一级品类也能直接记账。 */
  const groups = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((item) => item.kind === kind)
        .map((parent) => ({
          parent,
          children: (parent.children ?? []).filter((child) => !child.is_archived),
        })),
    [categoriesQuery.data, kind],
  );

  useEffect(() => {
    if (groups.length === 0) {
      setParentId(null);
      setCategoryId(null);
      return;
    }
    if (categoryId) {
      const owner = groups.find(
        (group) =>
          group.parent.id === categoryId ||
          group.children.some((child) => child.id === categoryId),
      );
      if (owner) {
        if (owner.parent.id !== parentId) setParentId(owner.parent.id);
        return;
      }
    }
    const first = groups.find((group) => group.children.length > 0) ?? groups[0];
    setParentId(first.parent.id);
    setCategoryId(first.children[0]?.id ?? first.parent.id);
  }, [groups, categoryId, parentId]);

  const activeGroup = groups.find((group) => group.parent.id === parentId) ?? groups[0] ?? null;

  /** 所有可记账的末级品类（没有子品类的一级品类也算末级）。 */
  const leafEntries = useMemo<LeafEntry[]>(
    () =>
      groups.flatMap((group): LeafEntry[] =>
        group.children.length > 0
          ? group.children.map((child) => ({ child, parent: group.parent }))
          : [{ child: group.parent, parent: null }],
      ),
    [groups],
  );

  /** 使用次数最高的末级品类，作为一键入口，省掉「先点一级再点二级」。 */
  const frequent = useMemo(
    () =>
      [...leafEntries]
        .filter((entry) => entry.child.usage > 0)
        .sort((a, b) => b.child.usage - a.child.usage)
        .slice(0, 6),
    [leafEntries],
  );

  const keyword = categoryKeyword.trim();
  const searchResults = keyword
    ? leafEntries.filter(
        (entry) =>
          entry.child.name.includes(keyword) || (entry.parent?.name ?? '').includes(keyword),
      )
    : [];

  const selectedEntry = leafEntries.find((entry) => entry.child.id === categoryId) ?? null;

  const pickCategory = (entry: LeafEntry) => {
    setCategoryId(entry.child.id);
    setParentId(entry.parent?.id ?? entry.child.id);
    setCategoryKeyword('');
  };

  const renderTile = (entry: LeafEntry, showParent = false, wide = false) => {
    const active = entry.child.id === categoryId;
    const stateClass = active
      ? 'border-transparent bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200'
      : 'border-slate-100 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-sm';
    return (
      <button
        key={entry.child.id}
        type="button"
        onClick={() => pickCategory(entry)}
        title={entry.parent ? `${entry.parent.name} › ${entry.child.name}` : entry.child.name}
        className={
          wide
            ? `col-span-4 flex flex-row items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-[12px] transition sm:col-span-6 ${stateClass}`
            : `group flex flex-col items-center gap-1 rounded-xl border px-1 py-1.5 transition duration-200 ${stateClass}`
        }
      >
        <span
          className={`leading-none transition group-hover:scale-110 ${
            wide ? 'text-[16px]' : 'text-lg'
          }`}
        >
          {entry.child.emoji}
        </span>
        <span className={wide ? '' : 'w-full truncate text-center text-[11px] font-medium'}>
          {entry.child.name}
          {wide ? '（无子品类，可直接记账）' : ''}
        </span>
        {showParent && entry.parent && (
          <span className="w-full truncate text-center text-[9.5px] text-slate-400">
            {entry.parent.name}
          </span>
        )}
      </button>
    );
  };

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
        // 连续记账：清空金额后把焦点交还给金额输入框
        requestAnimationFrame(() => amountRef.current?.focus());
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
        {selectedEntry ? (
          <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11.5px] text-slate-500">
            <span className="text-[13px] leading-none">{selectedEntry.child.emoji}</span>
            {selectedEntry.parent
              ? `${selectedEntry.parent.name} › ${selectedEntry.child.name}`
              : selectedEntry.child.name}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Sparkles size={13} />
            emoji 品类，两秒记完
          </span>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium text-slate-400">¥</span>
          <input
            ref={amountRef}
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

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">选择品类</span>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={categoryKeyword}
                onChange={(event) => setCategoryKeyword(event.target.value)}
                placeholder="搜索品类"
                className="h-7 w-32 rounded-lg border border-slate-200 bg-white pl-7 pr-6 text-[11.5px] text-slate-600 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
              {categoryKeyword && (
                <button
                  type="button"
                  onClick={() => setCategoryKeyword('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600"
                  aria-label="清空搜索"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            {categoriesQuery.loading ? (
              <Loader2 size={13} className="animate-spin text-slate-400" />
            ) : (
              <Link
                to="/app/categories"
                onClick={() => onCancel?.()}
                className="text-[11px] text-indigo-600 hover:text-indigo-700"
              >
                管理品类
              </Link>
            )}
          </div>
        </div>

        {keyword ? (
          searchResults.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {searchResults.map((entry) => renderTile(entry, true))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50/60 py-6 text-center text-xs text-slate-400">
              没有匹配「{keyword}」的品类
            </p>
          )
        ) : groups.length > 0 ? (
          <>
            {frequent.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 flex items-center gap-1 text-[10.5px] text-slate-400">
                  <Sparkles size={11} />
                  常用 · 一键选中
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {frequent.map((entry) => {
                    const active = entry.child.id === categoryId;
                    return (
                      <button
                        key={entry.child.id}
                        type="button"
                        onClick={() => pickCategory(entry)}
                        title={entry.parent ? `${entry.parent.name} › ${entry.child.name}` : entry.child.name}
                        className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] transition ${
                          active
                            ? 'border-indigo-200 bg-indigo-50 font-medium text-indigo-700'
                            : 'border-slate-100 bg-white text-slate-600 hover:border-indigo-100 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-[12px] leading-none">{entry.child.emoji}</span>
                        {entry.child.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const active = group.parent.id === parentId;
                return (
                  <button
                    key={group.parent.id}
                    type="button"
                    onClick={() => {
                      setParentId(group.parent.id);
                      setCategoryId(group.children[0]?.id ?? group.parent.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11.5px] transition ${
                      active
                        ? 'border-transparent bg-indigo-50 font-medium text-indigo-700 ring-2 ring-indigo-200'
                        : 'border-slate-100 bg-white text-slate-600 hover:border-indigo-100'
                    }`}
                  >
                    <span className="text-[14px] leading-none">{group.parent.emoji}</span>
                    {group.parent.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <p className="mb-1 text-[10.5px] text-slate-400">
                {activeGroup && activeGroup.children.length > 0
                  ? `「${activeGroup.parent.name}」下的子品类`
                  : '可直接记账的品类'}
              </p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {activeGroup && activeGroup.children.length > 0 ? (
                  activeGroup.children.map((child) =>
                    renderTile({ child, parent: activeGroup.parent }),
                  )
                ) : (
                  activeGroup && renderTile({ child: activeGroup.parent, parent: null }, false, true)
                )}
              </div>
            </div>
          </>
        ) : (
          !categoriesQuery.loading && (
            <p className="py-4 text-center text-xs text-slate-400">
              还没有品类，请先到「品类管理」创建
            </p>
          )
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

      <div className="mt-5 flex items-center justify-end gap-2">
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
