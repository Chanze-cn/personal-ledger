import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Layers,
  Pencil,
  Plus,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, todayISO } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { BudgetGroups, BudgetNode, Category, PeriodType } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Progress,
  Ring,
  Segmented,
  useToast,
} from '../components/ui';
import { useQuickEntry } from '../components/QuickEntry';

const PERIOD_OPTIONS: { value: PeriodType; label: string; desc: string }[] = [
  { value: 'day', label: '每日', desc: '当天 00:00 – 23:59' },
  { value: 'week', label: '每周', desc: '周一 – 周日' },
  { value: 'month', label: '每月', desc: '自然月' },
  { value: 'year', label: '每年', desc: '自然年' },
  { value: 'custom', label: '自定义', desc: '每 N 天一个周期' },
];

interface BudgetForm {
  mode: 'total' | 'category';
  parentId: string;
  categoryId: string;
  name: string;
  periodType: PeriodType;
  periodDays: string;
  anchorDate: string;
  amount: string;
}

const EMPTY_FORM: BudgetForm = {
  mode: 'total',
  parentId: '',
  categoryId: '',
  name: '',
  periodType: 'month',
  periodDays: '10',
  anchorDate: todayISO(),
  amount: '',
};

export default function Budgets() {
  const { version } = useQuickEntry();
  const toast = useToast();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetNode | null>(null);
  const [form, setForm] = useState<BudgetForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BudgetNode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tick, setTick] = useState(0);

  const budgetsQuery = useQuery<BudgetGroups>(() => api.budgets(kind), [kind, version, tick]);
  const categoriesQuery = useQuery(() => api.categories(), [version]);

  const categories: Category[] = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.kind === kind),
    [categoriesQuery.data, kind],
  );
  const groups = budgetsQuery.data;
  const totals = groups?.totals ?? [];
  const standalone = groups?.standalone ?? [];

  const reload = () => setTick((value) => value + 1);

  // 只在编辑时回填表单；新建时的初始值由 openCreate 决定（总预算 / 子预算各不相同）
  useEffect(() => {
    if (!modalOpen || !editing) return;
    setForm({
      mode: editing.is_total ? 'total' : 'category',
      parentId: editing.parent_id ? String(editing.parent_id) : '',
      categoryId: editing.category_id ? String(editing.category_id) : '',
      name: editing.name,
      periodType: editing.period_type,
      periodDays: String(editing.period_days ?? 10),
      anchorDate: editing.anchor_date ?? todayISO(),
      amount: String(editing.amount),
    });
  }, [modalOpen, editing]);

  const openCreate = (parent?: BudgetNode) => {
    setEditing(null);
    setForm(
      parent
        ? { ...EMPTY_FORM, mode: 'category', parentId: String(parent.id) }
        : { ...EMPTY_FORM, mode: 'total' },
    );
    setModalOpen(true);
  };

  const openEdit = (budget: BudgetNode) => {
    setEditing(budget);
    setModalOpen(true);
  };

  const isChild = Boolean(form.parentId);
  const parent = totals.find((item) => String(item.id) === form.parentId) ?? null;

  const save = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.push('请输入有效的预算金额', 'error');
      return;
    }
    if (form.mode === 'category' && !form.categoryId) {
      toast.push('请选择适用品类', 'error');
      return;
    }
    if ((form.mode === 'total' || !isChild) && form.periodType === 'custom') {
      if (!form.periodDays || Number(form.periodDays) < 1) {
        toast.push('自定义周期至少 1 天', 'error');
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      amount: Number(amount.toFixed(2)),
    };

    if (form.mode === 'total') {
      payload.category_id = null;
      payload.parent_id = null;
      payload.kind = kind;
      payload.period_type = form.periodType;
      payload.anchor_date = form.anchorDate;
      if (form.periodType === 'custom') payload.period_days = Number(form.periodDays);
    } else {
      payload.category_id = Number(form.categoryId);
      payload.parent_id = isChild ? Number(form.parentId) : null;
      if (!isChild) {
        payload.period_type = form.periodType;
        payload.anchor_date = form.anchorDate;
        if (form.periodType === 'custom') payload.period_days = Number(form.periodDays);
      }
    }

    setSaving(true);
    try {
      if (editing) await api.updateBudget(editing.id, payload);
      else await api.createBudget(payload);
      toast.push(editing ? '预算已更新' : '预算已创建');
      setModalOpen(false);
      reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await api.deleteBudget(pendingDelete.id);
      toast.push(
        result.removed_children > 0
          ? `预算已删除，同时移除 ${result.removed_children} 个品类子预算`
          : '预算已删除',
      );
      setPendingDelete(null);
      reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const summary = groups?.summary;
  const overriddenCount = totals.filter((item) => item.overridden).length;

  return (
    <div>
      <PageHeader
        title="预算管理"
        desc="一份总预算下挂品类子预算；子预算合计超过总预算时按较大值执行"
        actions={
          <>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: '支出预算' },
                { value: 'income', label: '收入预算' },
              ]}
            />
            <Button onClick={() => openCreate()}>
              <Plus size={16} />
              新建预算
            </Button>
          </>
        }
      />

      {summary && summary.count > 0 && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-5 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Wallet size={18} />
            </span>
            <div>
              <p className="text-[12px] text-slate-500">生效额度合计</p>
              <p className="tnum text-[22px] font-semibold tracking-tight">{money(summary.amount)}</p>
            </div>
          </div>
          <div className="min-w-[200px] flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-slate-500">
              <span>已用 {money(summary.used)}</span>
              <span>
                {summary.amount ? ((summary.used / summary.amount) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <Progress value={summary.amount ? (summary.used / summary.amount) * 100 : 0} />
          </div>
          <div className="text-right">
            <p className="text-[12px] text-slate-500">预算余额</p>
            <p
              className={`tnum text-[18px] font-semibold ${
                summary.amount - summary.used >= 0 ? 'text-income' : 'text-expense'
              }`}
            >
              {money(summary.amount - summary.used)}
            </p>
          </div>
        </Card>
      )}

      {overriddenCount > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[12px] leading-5 text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          有 {overriddenCount} 个总预算的品类子预算合计已超过总预算额度，系统按较大的合计值作为执行口径。
        </div>
      )}

      {budgetsQuery.loading && !groups ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="card h-44" />
          ))}
        </div>
      ) : !groups || groups.summary.count === 0 ? (
        <Card>
          <EmptyState
            emoji="🎯"
            title="还没有预算"
            desc="先建一份总预算约束大盘，再往下挂品类小预算；也可以只给某个品类单独设额度。"
            action={<Button onClick={() => openCreate()}>创建第一个预算</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {totals.map((budget) => (
            <TotalBudgetCard
              key={budget.id}
              budget={budget}
              onEdit={openEdit}
              onDelete={setPendingDelete}
              onAddChild={openCreate}
            />
          ))}

          {standalone.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-slate-500">
                <Layers size={13} />
                独立品类预算（未挂总预算）
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {standalone.map((budget) => (
                  <StandaloneCard
                    key={budget.id}
                    budget={budget}
                    onEdit={openEdit}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑预算' : '新建预算'}
        subtitle="已用金额直接读取流水，不受异步切片延迟影响"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              取消
            </button>
            <Button loading={saving} onClick={save}>
              {editing ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">预算类型</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'total' as const, title: '总预算', desc: '约束全部支出 / 收入' },
                { value: 'category' as const, title: '品类预算', desc: '只统计一个品类' },
              ].map((option) => {
                const active = form.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={Boolean(editing)}
                    onClick={() => setForm({ ...form, mode: option.value })}
                    className={`rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-[12.5px] font-medium">{option.title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">{option.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {form.mode === 'category' && (
            <>
              <div>
                <label className="label">适用品类</label>
                <select
                  value={form.categoryId}
                  onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                  className="field"
                >
                  <option value="">请选择品类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.emoji} {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">归属总预算</label>
                <select
                  value={form.parentId}
                  onChange={(event) => setForm({ ...form, parentId: event.target.value })}
                  className="field"
                  disabled={Boolean(editing && editing.parent_id)}
                >
                  <option value="">不归属（独立预算）</option>
                  {totals
                    .filter((item) => item.id !== editing?.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.period_label} · {money(item.effective_amount)}
                      </option>
                    ))}
                </select>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {isChild
                    ? '子预算的周期与「已用」统计窗口自动跟随父级总预算'
                    : '不归属时，这份品类预算独立计算自己的周期窗口'}
                </p>
              </div>
            </>
          )}

          {!isChild ? (
            <>
              <div>
                <label className="label">预算周期</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PERIOD_OPTIONS.map((option) => {
                    const active = form.periodType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm({ ...form, periodType: option.value })}
                        className={`rounded-xl border px-2 py-2 text-center transition ${
                          active
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="block text-[12px] font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[9.5px] text-slate-400">
                          {option.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.periodType === 'custom' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">周期长度（天）</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={form.periodDays}
                      onChange={(event) => setForm({ ...form, periodDays: event.target.value })}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label">周期起始日</label>
                    <input
                      type="date"
                      value={form.anchorDate}
                      onChange={(event) => setForm({ ...form, anchorDate: event.target.value })}
                      className="field"
                    />
                  </div>
                  <p className="text-[11px] leading-5 text-slate-400 sm:col-span-2">
                    从起始日起每 N 天为一个周期，滚动对齐，不随自然月漂移。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-[11.5px] leading-5 text-slate-500">
              周期继承自「{parent?.name ?? '父级总预算'}」：{parent?.period_label}（
              {PERIOD_OPTIONS.find((item) => item.value === parent?.period_type)?.label}）
            </div>
          )}

          <div>
            <label className="label">
              {form.mode === 'total' ? '总预算额度' : '品类预算额度'}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ¥
              </span>
              <input
                value={form.amount}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d.]/g, '');
                  if (/^\d*\.?\d{0,2}$/.test(next)) setForm({ ...form, amount: next });
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="field tnum pl-8 text-[17px] font-medium"
              />
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-5 text-slate-400">
              <Target size={12} className="mt-0.5 shrink-0 text-indigo-400" />
              总预算实际执行额度 = max(填写额度, 品类子预算额度合计)
            </p>
          </div>

          <div>
            <label className="label">预算名称（可选）</label>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value.slice(0, 30) })}
              placeholder="留空则使用品类名 / 全部支出"
              className="field"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这个预算？"
        subtitle={
          pendingDelete?.is_total && pendingDelete.children.length > 0
            ? `该总预算下有 ${pendingDelete.children.length} 个品类子预算，会一并删除`
            : '只删除预算定义，不会影响流水与统计'
        }
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
          {pendingDelete?.name} · {pendingDelete ? money(pendingDelete.effective_amount) : ''}
          {pendingDelete?.period_label ? ` · ${pendingDelete.period_label}` : ''}
        </p>
      </Modal>
    </div>
  );
}

function TotalBudgetCard({
  budget,
  onEdit,
  onDelete,
  onAddChild,
}: {
  budget: BudgetNode;
  onEdit: (budget: BudgetNode) => void;
  onDelete: (budget: BudgetNode) => void;
  onAddChild: (parent: BudgetNode) => void;
}) {
  const over = budget.ratio >= 100;
  const warn = budget.ratio >= 80;
  const color = over ? '#e11d48' : warn ? '#f59e0b' : '#4f46e5';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[18px]">
            🧮
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[14.5px] font-medium text-ink">
              {budget.name}
              <span className="chip bg-slate-100 text-[10px] text-slate-500">总预算</span>
              {budget.overridden && (
                <span className="chip bg-amber-50 text-[10px] text-amber-700">子预算合计生效</span>
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <CalendarClock size={11} />
              {budget.period_label}
              <span className="text-slate-300">·</span>
              {budget.children.length} 个品类子预算
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="soft" className="px-3 py-1.5 text-[12px]" onClick={() => onAddChild(budget)}>
            <Plus size={13} />
            添加子预算
          </Button>
          <button
            type="button"
            onClick={() => onEdit(budget)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(budget)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] text-slate-400">已用 / 生效额度</p>
          <p className="tnum mt-0.5 text-[22px] font-semibold tracking-tight">
            <span className={over ? 'text-expense' : 'text-ink'}>{money(budget.used)}</span>
            <span className="text-[13px] font-normal text-slate-400">
              {' / '}
              {money(budget.effective_amount)}
            </span>
          </p>
          {budget.overridden && (
            <p className="mt-1 text-[11px] text-amber-700">
              填写额度 {money(budget.amount)}，品类子预算合计 {money(budget.children_total)}
            </p>
          )}
        </div>
        <Ring value={budget.ratio} color={color} />
      </div>

      <div className="mt-3">
        <Progress value={budget.ratio} tone={over ? 'expense' : warn ? 'warn' : 'brand'} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
          <span className={over ? 'text-expense' : 'text-slate-500'}>
            {over ? `已超支 ${money(Math.abs(budget.remaining))}` : `剩余 ${money(budget.remaining)}`}
          </span>
          <span className="text-slate-400">
            {budget.days_left > 0
              ? `剩 ${budget.days_left} 天 · 每天可用 ${money(budget.daily_allowance)}`
              : '本期已结束'}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        {budget.children.length === 0 ? (
          <p className="py-2 text-center text-[11.5px] text-slate-400">
            还没有品类子预算，可以按品类拆解这份总预算
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {budget.children.map((child) => {
              const childOver = child.ratio >= 100;
              const childWarn = child.ratio >= 80;
              return (
                <div key={child.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[14px]"
                    style={{ background: `${child.category_color}18` }}
                  >
                    {child.category_emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-slate-700">
                        {child.category_name}
                      </span>
                      <span className="tnum shrink-0 text-[11.5px] text-slate-500">
                        <span className={childOver ? 'text-expense' : 'text-slate-700'}>
                          {money(child.used)}
                        </span>
                        {' / '}
                        {money(child.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Progress
                        value={child.ratio}
                        tone={childOver ? 'expense' : childWarn ? 'warn' : 'brand'}
                        height="h-1.5"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onEdit(child)}
                      className="rounded-lg p-1 text-slate-300 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="编辑"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(child)}
                      className="rounded-lg p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function StandaloneCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetNode;
  onEdit: (budget: BudgetNode) => void;
  onDelete: (budget: BudgetNode) => void;
}) {
  const over = budget.ratio >= 100;
  const warn = budget.ratio >= 80;
  const color = over ? '#e11d48' : warn ? '#f59e0b' : budget.category_color;

  return (
    <Card className="group p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
            style={{ background: `${budget.category_color}18` }}
          >
            {budget.category_emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{budget.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <CalendarClock size={11} />
              {budget.period_label}
              <span className="text-slate-300">·</span>
              独立预算
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(budget)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(budget)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] text-slate-400">已用 / 额度</p>
          <p className="tnum mt-0.5 text-[20px] font-semibold tracking-tight">
            <span className={over ? 'text-expense' : 'text-ink'}>{money(budget.used)}</span>
            <span className="text-[13px] font-normal text-slate-400">
              {' / '}
              {money(budget.amount)}
            </span>
          </p>
        </div>
        <Ring value={budget.ratio} color={color} />
      </div>

      <div className="mt-3">
        <Progress value={budget.ratio} tone={over ? 'expense' : warn ? 'warn' : 'brand'} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
          <span className={over ? 'text-expense' : 'text-slate-500'}>
            {over ? `已超支 ${money(Math.abs(budget.remaining))}` : `剩余 ${money(budget.remaining)}`}
          </span>
          <span className="text-slate-400">
            {budget.days_left > 0
              ? `剩 ${budget.days_left} 天 · 每天可用 ${money(budget.daily_allowance)}`
              : '本期已结束'}
          </span>
        </div>
      </div>
    </Card>
  );
}
