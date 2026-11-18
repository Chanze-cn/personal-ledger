import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

/* ---------------------------------- Toast --------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
interface ToastApi {
  push: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full animate-rise items-center gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-float"
          >
            {item.kind === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
            {item.kind === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
            {item.kind === 'info' && <Info size={16} className="text-sky-400" />}
            <span className="flex-1">{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) return { push: () => undefined };
  return context;
}

/* ---------------------------------- 基础 ---------------------------------- */

export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {desc && <p className="mt-1.5 text-sm text-slate-500">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'income' | 'expense' | 'brand';
  trend?: ReactNode;
}) {
  const toneClass = {
    default: 'text-ink',
    income: 'text-income',
    expense: 'text-expense',
    brand: 'text-brand',
  }[tone];

  return (
    <div className="card card-hover group relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition group-hover:bg-indigo-50 group-hover:text-brand">
            {icon}
          </span>
        )}
      </div>
      <div className={`tnum mt-3 text-[27px] font-semibold leading-none tracking-tight ${toneClass}`}>
        {value}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-400">
        {trend}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg font-medium transition duration-200 ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]'
            } ${
              active
                ? 'bg-white text-ink shadow-[0_1px_4px_rgba(13,21,38,.12)]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({
  value,
  tone = 'brand',
  height = 'h-2',
}: {
  value: number;
  tone?: 'brand' | 'income' | 'expense' | 'warn';
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const colors = {
    brand: 'from-indigo-500 to-violet-500',
    income: 'from-emerald-500 to-teal-400',
    expense: 'from-rose-500 to-orange-400',
    warn: 'from-amber-400 to-orange-500',
  }[tone];
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${colors} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const STATUS_STYLE: Record<string, { label: string; className: string; dot: string }> = {
  success: {
    label: '成功',
    className: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  running: {
    label: '执行中',
    className: 'bg-indigo-50 text-indigo-700',
    dot: 'bg-indigo-500 animate-pulse',
  },
  pending: { label: '排队中', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500 animate-pulse' },
  failed: { label: '失败', className: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
  };
  return (
    <span className={`chip ${style.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}

export function EmptyState({
  emoji = '🌱',
  title,
  desc,
  action,
}: {
  emoji?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-3xl">
        {emoji}
      </div>
      <p className="text-base font-medium text-ink">{title}</p>
      {desc && <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative max-h-[92vh] w-full animate-rise overflow-y-auto rounded-t-3xl bg-white shadow-float sm:rounded-xl2 ${width}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  loading?: boolean;
}) {
  const variants = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    soft: 'btn-soft',
    danger: 'btn-danger-soft',
  };
  return (
    <button className={`btn ${variants[variant]} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner size={15} />}
      {children}
    </button>
  );
}

/** 环形进度，用于预算卡片 */
export function Ring({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eef2f7"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center text-[11.5px] font-semibold text-slate-600">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
