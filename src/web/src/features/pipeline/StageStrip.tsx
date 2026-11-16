'use client';

import { toneDot } from '@/components/ui';
import { stageTone } from '@/components/status';
import { cn } from '@/lib/cn';

/**
 * Stage summary that doubles as the stage filter: one chip per stage with its count. Click chips
 * to show only those stages; "All" clears the filter.
 */
export function StageStrip({
  stages,
  selected,
  onChange,
}: {
  stages: { id: string; name: string; count: number; type?: string; color?: string | null }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const chip = (on: boolean) =>
    cn(
      'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      on && 'border-primary/40 bg-accent font-medium text-accent-foreground hover:bg-accent',
    );
  return (
    <div
      role="group"
      aria-label="Filter by stage"
      className="-mx-1 flex max-w-full min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 scrollbar-hide"
    >
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
        className={chip(selected.length === 0)}
      >
        All
        <span className="text-xs text-fg-subtle tnum">{total}</span>
      </button>
      {stages.map((stage) => {
        const on = selected.includes(stage.id);
        return (
          <button
            key={stage.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? selected.filter((id) => id !== stage.id) : [...selected, stage.id])
            }
            className={chip(on)}
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full', toneDot(stageTone(stage.type, stage.color)))}
            />
            {stage.name}
            <span className="text-xs text-fg-subtle tnum">{stage.count}</span>
          </button>
        );
      })}
    </div>
  );
}
