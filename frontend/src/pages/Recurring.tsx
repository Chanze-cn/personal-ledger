import { useMemo, useState } from 'react';
import { Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money, todayISO } from '../lib/format';
import { useQuery } from '../lib/hooks';
import type { Category, RecurringTemplate } from '../lib/types';
import { Button, Card, EmptyState, Modal, PageHeader, useToast } from '../components/ui';

const FREQUENCIES = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
] as const;

export default function Recurring() {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '', note: '', frequency: 'monthly', next_run_on: todayISO() });
  const templates = useQuery(() => api.recurring(), [tick]);
  const categories = useQuery(() => api.categories(false, true), []);
  const leaves = useMemo(
    () => (categories.data ?? []).flatMap((group: Category) =>
      group.children?.length ? group.children : [group],
    ),
    [categories.data],
  );

  const create = async () => {
    const amount = Number(form.amount);
    if (!form.category_id || !Number.isFinite(amount) || amount <= 0 || !form.next_run_on) {
      toast.push('请填写品类、金额和首次生成日期', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.createRecurring({ ...form, category_id: Number(form.category_id), amount: Number(amount.toFixed(2)) });
      toast.push('周期模板已创建');
      setOpen(false);
      setForm({ category_id: '', amount: '', note: '', frequency: 'monthly', next_run_on: todayISO() });
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await api.generateRecurring();
      toast.push(result.message);
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const toggle = async (item: RecurringTemplate) => {
    try {
      await api.updateRecurring(item.id, { is_active: !item.is_active });
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (item: RecurringTemplate) => {
    if (!window.confirm(`停用“${item.category_name}”周期模板？`)) return;
    try {
      await api.deleteRecurring(item.id);
      toast.push('周期模板已停用');
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="周期流水"
        desc="工资、房租和订阅等固定流水自动生成；重复执行不会重复记账"
        actions={<><Button variant="ghost" loading={generating} onClick={() => void generate()}><Play size={15} />生成到期流水</Button><Button onClick={() => setOpen(true)}><Plus size={16} />新建模板</Button></>}
      />
      {templates.loading && !templates.data ? <div className="card h-40" /> : (templates.data ?? []).length === 0 ? (
        <Card><EmptyState emoji="🔁" title="还没有周期模板" desc="为固定支出或收入创建模板，系统会按计划生成流水。" action={<Button onClick={() => setOpen(true)}>创建第一个模板</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(templates.data ?? []).map((item) => (
            <Card key={item.id} className={`${!item.is_active ? 'opacity-60' : ''} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl">{item.category_emoji}</span><div><p className="font-medium text-ink">{item.category_name}</p><p className="text-xs text-slate-400">{FREQUENCIES.find((frequency) => frequency.value === item.frequency)?.label} · 下次 {item.next_run_on}</p></div></div>
                <span className={`chip ${item.kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{item.kind === 'income' ? '收入' : '支出'}</span>
              </div>
              <div className="mt-5 flex items-end justify-between"><div><p className="tnum text-2xl font-semibold text-ink">{item.kind === 'income' ? '+' : '-'}{money(item.amount)}</p><p className="mt-1 text-xs text-slate-400">已生成 {item.generated_count} 笔{item.note ? ` · ${item.note}` : ''}</p></div><div className="flex gap-1"><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title={item.is_active ? '暂停' : '恢复'} onClick={() => void toggle(item)}>{item.is_active ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="停用" onClick={() => void remove(item)}><Trash2 size={15} /></button></div></div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="新建周期流水" subtitle="首次生成日期到期后，系统会自动创建流水">
        <div className="space-y-4">
          <div><label className="label">品类</label><select className="field" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">请选择末级品类</option>{leaves.map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>)}</select></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">金额</label><input className="field" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></div><div><label className="label">频率</label><select className="field" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>{FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</select></div></div>
          <div><label className="label">首次生成日期</label><input className="field" type="date" value={form.next_run_on} onChange={(event) => setForm({ ...form, next_run_on: event.target.value })} /></div>
          <div><label className="label">备注</label><input className="field" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="例如：房租" /></div>
          <div className="flex justify-end"><Button loading={saving} onClick={() => void create()}><Repeat size={15} />创建模板</Button></div>
        </div>
      </Modal>
    </div>
  );
}
