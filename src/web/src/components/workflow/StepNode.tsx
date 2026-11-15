import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StepTone = 'trigger' | 'logic' | 'action';

const tileTone: Record<StepTone, string> = {
  trigger: 'bg-accent text-tone-blue-dot',
  logic: 'bg-tone-gray-bg text-tone-gray-fg',
  action: 'bg-tone-green-bg text-tone-green-fg',
};

/** The coloured icon tile of a workflow step: blue starts, grey checks and waits, green actions. */
export function StepIcon({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon;
  tone: StepTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md',
        tileTone[tone],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/**
 * One step of a workflow: icon tile, eyebrow, title and a one-line summary. The editor puts it in
 * a React Flow node with handles; the gallery and read-only views use it as is.
 */
export function StepCard({
  icon,
  tone,
  eyebrow,
  title,
  summary,
  selected,
  state,
  footer,
  badge,
  className,
  children,
}: {
  icon: LucideIcon;
  tone: StepTone;
  eyebrow: string;
  title: ReactNode;
  summary?: ReactNode;
  selected?: boolean;
  /** Problem (red ring), active (the test run is here), passed (on the test path), off the path. */
  state?: 'problem' | 'active' | 'passed' | 'dimmed';
  /** Labelled outputs (Yes and No) along the bottom edge. */
  footer?: ReactNode;
  /** Small marker at the top right, for example a test outcome. */
  badge?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative w-64 rounded-xl border bg-card text-left shadow-card transition-[border-color,box-shadow,opacity]',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        state === 'problem' && 'border-destructive ring-2 ring-destructive/20',
        state === 'passed' && !selected && 'border-tone-green-dot',
        state === 'active' && 'border-primary ring-4 ring-primary/25',
        state === 'dimmed' && 'opacity-55',
        className,
      )}
    >
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <StepIcon icon={icon} tone={tone} />
          <span className="min-w-0 flex-1 truncate text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            {eyebrow}
          </span>
          {badge}
        </div>
        <p className="mt-2.5 text-base leading-snug font-semibold text-fg">{title}</p>
        {summary && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{summary}</p>}
      </div>
      {footer && (
        <div className="flex border-t border-border-subtle text-2xs font-medium text-fg-muted">
          {footer}
        </div>
      )}
      {children}
    </div>
  );
}
