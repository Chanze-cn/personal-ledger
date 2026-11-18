const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromISO(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(value: string, days: number): string {
  const date = fromISO(value);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function monthStart(value: string): string {
  const date = fromISO(value);
  return toISO(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function monthEnd(value: string): string {
  const date = fromISO(value);
  return toISO(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function weekStart(value: string): string {
  const date = fromISO(value);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return toISO(date);
}

export function weekEnd(value: string): string {
  return addDays(weekStart(value), 6);
}

export function money(value: number, withSign = false): string {
  const formatted = Math.abs(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? '-' : withSign ? '+' : '';
  return `${sign}¥${formatted}`;
}

export function moneyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  if (abs >= 1000) return `¥${(value / 1000).toFixed(1)}k`;
  return `¥${value.toFixed(0)}`;
}

export function signedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function dayLabel(value: string, withWeekday = true): string {
  const date = fromISO(value);
  const base = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return withWeekday ? `${base} ${WEEKDAYS[date.getDay()]}` : base;
}

export function shortDay(value: string): string {
  const date = fromISO(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function relativeTime(value: string): string {
  const target = new Date(value);
  const diff = Date.now() - target.getTime();
  if (Number.isNaN(diff)) return value;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return target.toLocaleDateString('zh-CN');
}

export function clockTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

export function durationLabel(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function dateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => `${input}`.padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

export function shiftMonth(value: string, delta: number): string {
  const date = fromISO(monthStart(value));
  return toISO(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

export function shiftYear(value: string, delta: number): string {
  const date = fromISO(value);
  return toISO(new Date(date.getFullYear() + delta, date.getMonth(), 1));
}

export function shiftWeek(value: string, delta: number): string {
  return addDays(weekStart(value), delta * 7);
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
