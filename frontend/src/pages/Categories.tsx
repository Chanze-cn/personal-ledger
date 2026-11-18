import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useQuery } from '../lib/hooks';
import type { Category } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Segmented,
  useToast,
} from '../components/ui';
import { useQuickEntry } from '../components/QuickEntry';

const EMOJI_SUGGESTIONS = [
  '🍜', '🚇', '🛍️', '🏠', '🎮', '💊', '📚', '📱', '✈️', '🐾', '🎁', '☕',
  '💰', '🏆', '📈', '💼', '🧧', '💵',
];

const COLORS = [
  '#F97316', '#0EA5E9', '#EC4899', '#6366F1', '#8B5CF6', '#EF4444',
  '#14B8A6', '#06B6D4', '#22C55E', '#A16207', '#F43F5E', '#94A3B8',
  '#10B981', '#059669', '#0D9488', '#65A30D', '#DC2626', '#64748B',
];

export default function Categories() {
  const { version } = useQuickEntry();
  const toast = useToast();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [color, setColor] = useState('#6366F1');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tick, setTick] = useState(0);

  const { data, loading, reload } = useQuery(
    () => api.categories(showArchived),
    [showArchived, version, tick],
  );

  const items = (data ?? []).filter((item) => item.kind === kind);
  const archivedCount = (data ?? []).filter((item) => item.is_archived).length;

  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      setName(editing.name);
      setEmoji(editing.emoji);
      setColor(editing.color);
    } else {
      setName('');
      setEmoji('📦');
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
  }, [modalOpen, editing]);

  const save = async () => {
    if (!name.trim()) {
      toast.push('请输入品类名称', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateCategory(editing.id, { name: name.trim(), emoji, color });
      } else {
        await api.createCategory({ name: name.trim(), emoji, kind, color });
      }
      toast.push(editing ? '品类已更新' : '品类已创建');
      setModalOpen(false);
      reload();
      setTick((value) => value + 1);
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
      const result = await api.deleteCategory(pendingDelete.id);
      toast.push(result.message);
      setPendingDelete(null);
      reload();
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (category: Category) => {
    try {
      const result = await api.restoreCategory(category.id);
      toast.push(result.message);
      reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="品类管理"
        desc="emoji + 颜色的自定义品类；已有流水的品类会被归档而不是删除"
        actions={
          <>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: '支出' },
                { value: 'income', label: '收入' },
              ]}
            />
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus size={16} />
              新建品类
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <Tags size={13} />
          {items.length} 个{kind === 'expense' ? '支出' : '收入'}品类
          {archivedCount > 0 && ` · 已归档 ${archivedCount} 个`}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
          />
          显示已归档品类
        </label>
      </div>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="card h-[92px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🏷️"
            title={`还没有${kind === 'expense' ? '支出' : '收入'}品类`}
            desc="品类是记账的基础，建议先创建几个常用的"
            action={<Button onClick={() => { setEditing(null); setModalOpen(true); }}>创建品类</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((category) => (
            <Card key={category.id} className="group p-4" hover>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                    style={{ background: `${category.color}1f` }}
                  >
                    {category.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[14px] font-medium text-ink">
                      {category.name}
                      {category.is_archived && (
                        <span className="chip bg-slate-100 text-[9.5px] text-slate-500">已归档</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {category.usage > 0 ? `${category.usage} 笔流水` : '暂无流水'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  {category.is_archived ? (
                    <button
                      type="button"
                      onClick={() => restore(category)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                      title="恢复"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(category);
                          setModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                        title="编辑"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(category)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {category.usage > 0 && !category.is_archived && (
                <p className="mt-2.5 flex items-center gap-1 text-[10.5px] text-slate-400">
                  <Archive size={10} />
                  删除时会自动归档，保留历史记录
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑品类' : '新建品类'}
        subtitle={`当前类型：${kind === 'expense' ? '支出' : '收入'}`}
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
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="label">品类名称</label>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 12))}
                placeholder="例如：餐饮"
                className="field"
              />
            </div>
            <div>
              <label className="label">图标</label>
              <input
                value={emoji}
                onChange={(event) => setEmoji(event.target.value.slice(0, 4))}
                className="field w-16 text-center text-lg"
              />
            </div>
          </div>

          <div>
            <label className="label">常用图标</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setEmoji(item)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[16px] transition ${
                    emoji === item ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">主题色</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={`h-7 w-7 rounded-lg transition ${
                    color === item ? 'ring-2 ring-offset-2 ring-slate-300' : ''
                  }`}
                  style={{ background: item }}
                  aria-label={item}
                />
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[17px]"
                style={{ background: `${color}1f` }}
              >
                {emoji}
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">{name || '品类预览'}</p>
                <p className="text-[11px] text-slate-400">{kind === 'expense' ? '支出' : '收入'}品类</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除这个品类？"
        subtitle={
          (pendingDelete?.usage ?? 0) > 0
            ? '该品类已有流水，将被归档以保留历史记录，可随时恢复'
            : '该品类没有流水，将被直接删除'
        }
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              {(pendingDelete?.usage ?? 0) > 0 ? '归档' : '删除'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {pendingDelete?.emoji} {pendingDelete?.name}
        </p>
      </Modal>
    </div>
  );
}
