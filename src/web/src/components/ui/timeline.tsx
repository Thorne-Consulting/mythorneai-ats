import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from './badge';

const dot: Record<Tone, string> = {
  blue: 'bg-tone-blue-dot',
  violet: 'bg-tone-violet-dot',
  green: 'bg-tone-green-dot',
  amber: 'bg-tone-amber-dot',
  red: 'bg-tone-red-dot',
  gray: 'bg-tone-gray-dot',
};

export type TimelineEntry = {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
};

/** Vertical activity feed: dot or icon, title, meta line, optional body. */
export function Timeline({ items, className }: { items: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && (
            <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-border" />
          )}
          <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-card">
            {item.icon ? (
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full bg-accent text-tone-blue-dot [&_svg]:size-3.5',
                )}
              >
                {item.icon}
              </span>
            ) : (
              <span
                className={cn('size-2.5 rounded-full ring-4 ring-card', dot[item.tone ?? 'gray'])}
              />
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-base text-fg">{item.title}</p>
            {item.meta && <p className="mt-0.5 text-xs text-fg-subtle">{item.meta}</p>}
            {item.body && <div className="mt-2 text-sm text-fg-muted">{item.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Horizontal steps (create-job wizard, workflow stages). */
export function Steps({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-2', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold tnum',
                state === 'done' && 'bg-primary text-primary-foreground',
                state === 'current' && 'bg-accent text-accent-foreground ring-2 ring-primary',
                state === 'todo' && 'bg-secondary text-fg-subtle',
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn('text-sm', state === 'todo' ? 'text-fg-subtle' : 'font-medium text-fg')}
            >
              {s}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-8 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
