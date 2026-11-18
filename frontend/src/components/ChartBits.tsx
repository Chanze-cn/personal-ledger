import { money } from '../lib/format';

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[132px] rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      {label !== undefined && <p className="mb-1.5 text-[11px] text-slate-400">{label}</p>}
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div
            key={`${item.dataKey}-${index}`}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <span className="flex items-center gap-1.5 text-slate-500">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: item.color ?? '#6366f1' }}
              />
              {item.dataKey === 'income' ? '收入' : item.dataKey === 'expense' ? '支出' : item.name}
            </span>
            <span className="tnum font-medium text-ink">
              {typeof item.value === 'number' ? money(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendDots({
  items,
}: {
  items: { label: string; color: string; value?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
          {item.value && <span className="tnum text-slate-400">{item.value}</span>}
        </span>
      ))}
    </div>
  );
}
