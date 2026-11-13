'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/components/ui';

export type CalendarEvent = {
  id: string;
  start: Date;
  end: Date;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
};

const toneBox: Record<Tone, string> = {
  blue: 'border-tone-blue-dot bg-tone-blue-bg',
  violet: 'border-tone-violet-dot bg-tone-violet-bg',
  green: 'border-tone-green-dot bg-tone-green-bg',
  amber: 'border-tone-amber-dot bg-tone-amber-bg',
  red: 'border-tone-red-dot bg-tone-red-bg',
  gray: 'border-tone-gray-dot bg-tone-gray-bg',
};
const toneTime: Record<Tone, string> = {
  blue: 'text-tone-blue-fg',
  violet: 'text-tone-violet-fg',
  green: 'text-tone-green-fg',
  amber: 'text-tone-amber-fg',
  red: 'text-tone-red-fg',
  gray: 'text-tone-gray-fg',
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
const timeLabel = (d: Date) =>
  d
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(' ', '')
    .replace(/(AM|PM)/, '');

/**
 * Figma interviews week view: day columns, hour rows, events as tinted blocks with a coloured
 * left rule. Today's column header is highlighted. Hours outside [startHour, endHour) are hidden.
 */
export function WeekCalendar({
  days,
  events,
  startHour = 9,
  endHour = 18,
  hourHeight = 54,
  today = new Date(),
  onSlotClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  today?: Date;
  /** Click an empty half-hour slot (e.g. to schedule at that time). */
  onSlotClick?: (start: Date) => void;
}) {
  const nowTop = (today.getHours() + today.getMinutes() / 60 - startHour) * hourHeight;
  const showNow = nowTop >= 0 && nowTop <= (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="grid grid-cols-[52px_repeat(var(--days),1fr)] gap-1.5 pb-2"
          style={{ ['--days' as string]: days.length }}
        >
          <span />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                'rounded-md py-2 text-center text-base text-fg-muted',
                sameDay(d, today) && 'bg-accent font-semibold text-accent-foreground',
              )}
            >
              {d.toLocaleDateString([], { weekday: 'short' })} {d.getDate()}
            </div>
          ))}
        </div>
        <div
          className="relative grid grid-cols-[52px_repeat(var(--days),1fr)]"
          style={{ ['--days' as string]: days.length }}
        >
          <div>
            {hours.map((h) => (
              <div key={h} className="-mt-2 text-2xs text-fg-subtle" style={{ height: hourHeight }}>
                {hourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                'relative border-l border-border-subtle',
                sameDay(d, today) && 'bg-accent/30',
              )}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-border-subtle"
                  style={{ height: hourHeight }}
                >
                  {onSlotClick &&
                    [0, 30].map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-label={`Schedule on ${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at ${hourLabel(h).replace(' ', m ? ':30 ' : ' ')}`}
                        onClick={() =>
                          onSlotClick(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m))
                        }
                        className="block w-full hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
                        style={{ height: hourHeight / 2 }}
                      />
                    ))}
                </div>
              ))}
              {showNow && sameDay(d, today) && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
                  style={{ top: nowTop }}
                >
                  <span className="-ml-1 size-2 rounded-full bg-destructive" />
                  <span className="h-px flex-1 bg-destructive" />
                </div>
              )}
              {events
                .filter((e) => sameDay(e.start, d))
                .map((e) => {
                  const top =
                    (e.start.getHours() + e.start.getMinutes() / 60 - startHour) * hourHeight;
                  const height = Math.max(
                    ((e.end.getTime() - e.start.getTime()) / 3_600_000) * hourHeight - 3,
                    28,
                  );
                  const tone = e.tone ?? 'blue';
                  const Tag = e.onClick ? 'button' : 'div';
                  return (
                    <Tag
                      key={e.id}
                      type={e.onClick ? 'button' : undefined}
                      onClick={e.onClick}
                      className={cn(
                        'absolute right-1 left-1 overflow-hidden rounded-[5px] border-l-[3px] px-2 py-1 text-left',
                        toneBox[tone],
                        e.onClick && 'hover:brightness-[0.97]',
                      )}
                      style={{ top: top + 1, height }}
                    >
                      <p className={cn('text-2xs tnum', toneTime[tone])}>
                        {timeLabel(e.start)}–{timeLabel(e.end)}
                      </p>
                      <p className="truncate text-xs font-semibold text-fg">{e.title}</p>
                      {e.subtitle && (
                        <p className="truncate text-2xs text-fg-muted">{e.subtitle}</p>
                      )}
                    </Tag>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Monday-based week containing `date`. */
export function weekOf(date: Date, length = 5): Date[] {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
}
