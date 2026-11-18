import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock3,
  Database,
  Fingerprint,
  LogOut,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { clockTime, durationLabel } from '../lib/format';
import { useQuery } from '../lib/hooks';
import {
  Button,
  Card,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui';
import { useQuickEntry } from '../components/QuickEntry';

const AVATARS = ['🐳', '🙂', '🐱', '🦊', '🐼', '🚀', '🌱', '🍀', '🎯', '📘'];

export default function Settings() {
  const { user, logout, refresh } = useAuth();
  const { bump } = useQuickEntry();
  const toast = useToast();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatar, setAvatar] = useState(user?.avatar_emoji ?? '🙂');
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [seeding, setSeeding] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const system = useQuery(() => api.systemInfo(), [tick]);

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
    setAvatar(user?.avatar_emoji ?? '🙂');
  }, [user?.display_name, user?.avatar_emoji]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.updateMe({ display_name: displayName.trim(), avatar_emoji: avatar });
      await refresh();
      toast.push('资料已保存');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.push('请填写原密码与新密码', 'error');
      return;
    }
    if (newPassword.length < 6) {
      toast.push('新密码至少 6 位', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.push('两次输入的新密码不一致', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      toast.push('密码已更新（加密传输）');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const result = await api.demoData();
      toast.push(result.message);
      window.setTimeout(() => setTick((value) => value + 1), 1500);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSeeding(false);
    }
  };

  const resetData = async () => {
    setResetting(true);
    try {
      const result = await api.resetData();
      toast.push(result.message);
      setResetOpen(false);
      bump();
      setTick((value) => value + 1);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setResetting(false);
    }
  };

  const info = system.data;

  return (
    <div>
      <PageHeader title="设置" desc="账号资料、密码安全与数据管理" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">账号信息</p>
              <p className="mt-0.5 text-xs text-slate-400">你的登录身份</p>
            </div>
            <UserRound size={16} className="text-slate-300" />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50/70 p-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[22px] shadow-sm">
              {avatar}
            </span>
            <div>
              <p className="text-[14px] font-medium text-ink">
                {user?.display_name || user?.username}
              </p>
              <p className="text-[11.5px] text-slate-400">
                @{user?.username} · ID {user?.id} · {user?.role === 'admin' ? '管理员' : '成员'}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="label">显示昵称</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 20))}
              placeholder="你的称呼"
              className="field"
            />
          </div>

          <div className="mt-3">
            <label className="label">头像</label>
            <div className="flex flex-wrap gap-1.5">
              {AVATARS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAvatar(item)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[16px] transition ${
                    avatar === item ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button variant="ghost" onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={15} />
              退出登录
            </Button>
            <Button loading={savingProfile} onClick={saveProfile}>
              保存资料
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">修改密码</p>
              <p className="mt-0.5 text-xs text-slate-400">提交后立即生效</p>
            </div>
            <ShieldCheck size={16} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="label">原密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                placeholder="请输入当前密码"
                className="field"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label">新密码（至少 6 位）</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="请输入新密码"
                className="field"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                className="field"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3">
            <Fingerprint size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-[11px] leading-5 text-emerald-800/80">
              原密码与新密码都会先用 RSA-OAEP 包裹的 AES-256-GCM 会话密钥加密，
              服务端解密校验后仅保存 PBKDF2 哈希，网络链路上不出现明文。
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button loading={savingPassword} onClick={savePassword}>
              更新密码
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">数据管理</p>
              <p className="mt-0.5 text-xs text-slate-400">仅影响当前账号</p>
            </div>
            <Database size={16} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-slate-700">生成示例数据</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  生成 40 天模拟流水并重建切片，便于查看报表效果
                </p>
              </div>
              <Button variant="soft" loading={seeding} onClick={seedDemo} className="shrink-0">
                <Sparkles size={14} />
                生成
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/40 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-rose-700">清空业务数据</p>
                <p className="mt-0.5 text-[11px] text-rose-500/80">
                  删除全部流水、切片与预算，保留账号与品类
                </p>
              </div>
              <Button variant="danger" onClick={() => setResetOpen(true)} className="shrink-0">
                <Trash2 size={14} />
                清空
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">系统信息</p>
              <p className="mt-0.5 text-xs text-slate-400">运行状态与调度配置</p>
            </div>
            <Clock3 size={16} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-2.5 text-[12px]">
            <InfoRow label="服务时间" value={info ? clockTime(info.server_time) : '—'} />
            <InfoRow label="流水条数" value={`${info?.txn_count ?? 0} 笔`} />
            <InfoRow label="日切片" value={`${info?.daily_rows ?? 0} 行`} />
            <InfoRow label="周期切片" value={`${info?.period_rows ?? 0} 行`} />
            <InfoRow label="预算数量" value={`${info?.budget_count ?? 0} 个`} />
            <InfoRow
              label="日切片调度"
              value={info ? `每天 ${info.scheduler.daily_rollup_at}` : '—'}
            />
            <InfoRow
              label="补偿巡检"
              value={info ? `每 ${info.scheduler.catchup_every_minutes} 分钟` : '—'}
            />
            <InfoRow label="传输加密" value={info?.transport ?? '—'} />
            {info?.last_job && (
              <InfoRow
                label="最近任务"
                value={`${info.last_job.name} · ${info.last_job.status}${
                  info.last_job.finished_at ? ` · ${clockTime(info.last_job.finished_at)}` : ''
                }`}
              />
            )}
          </div>

          <p className="mt-3 text-[11px] leading-5 text-slate-400">
            {info?.scheduler.desc ?? '定时任务每天自动切片；缺失时自动补算。'}
          </p>
        </Card>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="清空业务数据？"
        subtitle="流水、切片与预算会被删除，账号与品类保留，操作不可撤销"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
              取消
            </button>
            <Button variant="danger" loading={resetting} onClick={resetData}>
              确认清空
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          当前有 {info?.txn_count ?? 0} 笔流水、{info?.budget_count ?? 0} 个预算将被删除。
        </p>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right text-slate-600">{value}</span>
    </div>
  );
}
