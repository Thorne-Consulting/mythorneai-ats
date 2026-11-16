'use client';

import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export type WizardStep = {
  id: string;
  title: string;
  description?: string;
  /** False blocks Next and any later step. Default true. */
  valid?: boolean;
  optional?: boolean;
};

/**
 * Long form split into steps: vertical step list on the left (top on small screens), the current
 * step's content in a card, and a sticky Back / Next (or Finish) bar. The caller renders the
 * content for `current`; the wizard only handles navigation.
 */
export function Wizard({
  steps,
  current,
  onStepChange,
  onFinish,
  finishLabel = 'Finish',
  busy,
  aside,
  children,
  className,
}: {
  steps: WizardStep[];
  current: number;
  onStepChange: (index: number) => void;
  onFinish: () => void;
  finishLabel?: string;
  busy?: boolean;
  /** Optional right-hand panel (live preview, tips). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const reachable = (i: number) => steps.slice(0, i).every((s) => s.valid !== false);
  const last = current === steps.length - 1;
  const step = steps[current];
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)]',
        aside && 'xl:grid-cols-[220px_minmax(0,1fr)_320px]',
        className,
      )}
    >
      <nav aria-label="Steps" className="min-w-0 lg:sticky lg:top-[101px] lg:self-start">
        <ol className="flex gap-2 overflow-x-auto scrollbar-hide lg:flex-col lg:gap-1">
          {steps.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo';
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  disabled={!reachable(i)}
                  onClick={() => onStepChange(i)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
                    state === 'current' && 'bg-accent hover:bg-accent',
                  )}
                >
                  <span
                    className={cn(
                      'mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tnum',
                      state === 'done' && 'bg-primary text-primary-foreground',
                      state === 'current' && 'bg-card text-accent-foreground ring-2 ring-primary',
                      state === 'todo' && 'bg-secondary text-fg-subtle',
                    )}
                  >
                    {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm',
                        state === 'todo' ? 'text-fg-muted' : 'font-medium text-fg',
                      )}
                    >
                      {s.title}
                      {s.optional && (
                        <span className="ml-1 text-2xs font-normal text-fg-subtle">(optional)</span>
                      )}
                    </span>
                    {s.description && (
                      <span className="mt-0.5 hidden text-xs text-fg-subtle lg:block">
                        {s.description}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="min-w-0">
        <div className="rounded-xl border border-border-subtle bg-card shadow-card">
          <div className="border-b border-border-subtle px-6 py-4">
            <p className="text-xs text-fg-subtle tnum">
              Step {current + 1} of {steps.length}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-fg">{step.title}</h2>
            {step.description && (
              <p className="mt-0.5 text-sm text-fg-subtle">{step.description}</p>
            )}
          </div>
          <div className="px-6 py-5">{children}</div>
          <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-b-xl border-t border-border-subtle bg-card px-6 py-4">
            <Button
              variant="secondary"
              leftIcon={<ChevronLeft />}
              disabled={current === 0 || busy}
              onClick={() => onStepChange(current - 1)}
            >
              Back
            </Button>
            {last ? (
              <Button loading={busy} disabled={step.valid === false} onClick={onFinish}>
                {finishLabel}
              </Button>
            ) : (
              <Button
                rightIcon={<ChevronRight />}
                disabled={step.valid === false}
                onClick={() => onStepChange(current + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
      {aside && (
        <aside className="hidden xl:sticky xl:top-[101px] xl:block xl:self-start">{aside}</aside>
      )}
    </div>
  );
}
