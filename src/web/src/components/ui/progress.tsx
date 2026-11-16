import { cn } from '@/lib/cn';
import type { Tone } from './badge';

const bar: Record<Tone | 'primary', string> = {
  primary: 'bg-primary',
  blue: 'bg-tone-blue-dot',
  violet: 'bg-tone-violet-dot',
  green: 'bg-tone-green-dot',
  amber: 'bg-tone-amber-dot',
  red: 'bg-tone-red-dot',
  gray: 'bg-tone-gray-dot',
};

export function Progress({
  value,
  max = 100,
  tone = 'primary',
  size = 'md',
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone | 'primary';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn(
        'w-full overflow-hidden rounded-full bg-secondary',
        size === 'sm' && 'h-1',
        size === 'md' && 'h-1.5',
        size === 'lg' && 'h-5 rounded-sm',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width]',
          size === 'lg' && 'rounded-sm',
          bar[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Label + value row over a bar (Figma "Completion overview"). */
export function ProgressRow({
  label,
  value,
  max,
  display,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  display?: string;
  tone?: Tone | 'primary';
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold text-fg tnum">{display ?? value}</span>
      </div>
      <Progress value={value} max={max} tone={tone} label={label} />
    </div>
  );
}
