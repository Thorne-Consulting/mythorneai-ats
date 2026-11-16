'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { interviewHref, type CalendarInterview } from './interview-api';
import { interviewState, type StateTone } from './interview-state';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const chipTone: Record<StateTone, string> = {
  blue: 'border-tone-blue-dot bg-tone-blue-bg',
  violet: 'border-tone-violet-dot bg-tone-violet-bg',
  green: 'border-tone-green-dot bg-tone-green-bg',
  amber: 'border-tone-amber-dot bg-tone-amber-bg',
  red: 'border-tone-red-dot bg-tone-red-bg',
  gray: 'border-tone-gray-dot bg-tone-gray-bg',
};

/**
 * Month view: one cell per day with a count and the first few interviews as chips, coloured by
 * state. Chips hide on phones, where the count is the signal; tapping a day opens it in the Day view.
 */
export function MonthGrid({
  month,
  days,
  interviews,
  onDayOpen,
}: {
  month: number;
  days: Date[];
  interviews: CalendarInterview[];
  onDayOpen: (day: Date) => void;
}) {
  const today = new Date().toDateString();
  const byDay = new Map<string, CalendarInterview[]>();
  for (const item of interviews) {
    const key = new Date(item.startsAt).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle">
      <div className="grid grid-cols-7 bg-muted" aria-hidden>
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1.5 text-xs text-fg-muted">
            {day}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {days.map((day) => {
          const items = byDay.get(day.toDateString()) ?? [];
          const outside = day.getMonth() !== month;
          const label = day.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          });
          return (
            <li
              key={day.toISOString()}
              className={cn(
                'min-h-16 border-t border-l border-border-subtle p-1 first:border-l-0 sm:min-h-28 sm:p-1.5 [&:nth-child(7n+1)]:border-l-0',
                outside && 'bg-muted/40',
              )}
            >
              <button
                type="button"
                onClick={() => onDayOpen(day)}
                aria-label={`${label}: ${items.length} interview${items.length === 1 ? '' : 's'}. Open day`}
                className="flex w-full items-center justify-between gap-1 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs tnum',
                    outside ? 'text-fg-subtle' : 'text-fg',
                    day.toDateString() === today &&
                      'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {day.getDate()}
                </span>
                {items.length > 0 && (
                  <span className="rounded-full bg-tone-blue-bg px-1.5 text-2xs font-semibold text-tone-blue-fg tnum">
                    {items.length}
                  </span>
                )}
              </button>
              <ul className="mt-1 hidden space-y-0.5 sm:block">
                {items.slice(0, MAX_CHIPS).map((item) => {
                  const state = interviewState(item.status, item.startsAt, item.endsAt);
                  return (
                    <li key={item.id}>
                      <Link
                        href={interviewHref(item.id)}
                        title={`${item.title} · ${item.requisitionTitle} · ${state.label}`}
                        className={cn(
                          'block truncate rounded-sm border-l-2 px-1.5 py-0.5 text-2xs text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          chipTone[state.tone],
                          state.look === 'dashed' && 'border border-l-2 border-dashed bg-card',
                          state.look === 'muted' && 'opacity-65',
                          state.look === 'struck' && 'line-through opacity-60',
                        )}
                      >
                        <span className="text-fg-muted tnum">{time(item.startsAt)}</span>{' '}
                        {item.candidateName}
                      </Link>
                    </li>
                  );
                })}
                {items.length > MAX_CHIPS && (
                  <li>
                    <button
                      type="button"
                      onClick={() => onDayOpen(day)}
                      className="px-1.5 text-2xs font-medium text-accent-foreground hover:underline"
                    >
                      +{items.length - MAX_CHIPS} more
                    </button>
                  </li>
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
