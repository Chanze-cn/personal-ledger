import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Loader2,
  LockKeyhole,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { CursorGlow } from '../components/CursorGlow';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

export default function Login() {
  const { user, login, register, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/app" replace />;

  const isRegister = mode === 'register';

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError(null);
    setConfirmPassword('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isRegister) {
        await register(username.trim(), password, displayName.trim());
      } else {
        await login(username.trim(), password);
      }
      navigate('/app', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dark-surface relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070a12] px-5 py-10 text-slate-200">
      <CursorGlow dark />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(99,102,241,.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(16,185,129,.14), transparent 45%)',
        }}
      />

      <div className="relative z-10 grid w-full max-w-4xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="hidden lg:block">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-[12px] text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft size={13} />
            返回官网
          </Link>
          <h1 className="mt-8 text-[34px] font-semibold leading-tight tracking-tight text-white">
            欢迎回来，
            <br />
            继续记录你的现金流。
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">
            Ledger 以流水为基准生成统计切片，编辑历史记录会自动重算后续周期。你的数据只属于你的账号。
          </p>
          <ul className="mt-8 space-y-3 text-[13px] text-slate-400">
            {[
              'emoji 品类 + ⌘K 极速记账',
              '总预算 + 品类子预算，超额自动提示',
              '周 / 月 / 年报表，含环比与同比',
              '多账号数据隔离，注册即用',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400/80" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[26px] border border-white/10 bg-[#0b1120]/80 p-7 shadow-[0_40px_120px_-40px_rgba(0,0,0,.9)] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-sm font-bold text-white">
              L
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-white">
                {isRegister ? '注册新账号' : '登录 Ledger'}
              </p>
              <p className="text-[11px] text-slate-500">
                {isRegister ? '注册后立即登录' : '继续你的记账'}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <div>
                <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400">
                  昵称（可选）
                </label>
                <div className="relative">
                  <UserPlus
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="用于页面展示，留空则与账号一致"
                    autoComplete="nickname"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400">
                账号
              </label>
              <div className="relative">
                <UserRound
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={isRegister ? '3-32 位中英文、数字、_ 或 -' : '请输入账号'}
                  autoComplete="username"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400">
                密码
              </label>
              <div className="relative">
                <LockKeyhole
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isRegister ? '至少 6 位' : '••••••'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
            </div>
            {isRegister && (
              <div>
                <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-slate-400">
                  确认密码
                </label>
                <div className="relative">
                  <LockKeyhole
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? (isRegister ? '注册中' : '登录中') : isRegister ? '注册并登录' : '登录'}
              {!submitting && (
                <ArrowRight size={15} className="transition group-hover:translate-x-1" />
              )}
            </button>
          </form>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3.5 py-2.5">
            <Fingerprint size={13} className="mt-0.5 shrink-0 text-emerald-400/80" />
            <p className="text-[11px] leading-4.5 text-slate-400">
              账号密码经 RSA-OAEP + AES-256-GCM 混合加密后传输，服务端仅保存 PBKDF2 哈希，全程不出现明文。
            </p>
          </div>

          <button
            type="button"
            onClick={switchMode}
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl border border-white/10 py-2.5 text-[12px] text-slate-400 transition hover:border-white/20 hover:text-slate-200"
          >
            {isRegister ? '已有账号？返回登录' : '还没有账号？注册新账号'}
          </button>

          <p className="mt-5 text-center text-[11px] text-slate-600 lg:hidden">
            <Link to="/" className="underline-offset-2 hover:text-slate-400 hover:underline">
              返回官网
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
