'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger, type Tone } from '@/components/ui';
import { layoutEvents } from './event-layout';

export type CalendarEvent = {
  id: string;
  start: Date;
  end: Date;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: Tone;
  /** solid: booked · dashed: waiting for someone · muted: in the past · struck: cancelled. */
  look?: 'solid' | 'dashed' | 'muted' | 'struck';
  /** Shown in a popover when the event is clicked. */
  popover?: ReactNode;
  /** Double-click or Enter. Without a popover, a click too. */
  onOpen?: () => void;
  /** Spoken name for the event button. */
  label?: string;
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
const looks = {
  solid: '',
  dashed: 'border border-l-[3px] border-dashed bg-card',
  muted: 'opacity-65',
  struck: 'opacity-60 [&_.event-title]:line-through',
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
 * left rule. Overlapping events sit side by side. Today's column header is highlighted. Hours
 * outside [startHour, endHour) are hidden.
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
  /** Click an empty half-hour slot (for example to schedule at that time). */
  onSlotClick?: (start: Date) => void;
}) {
  const nowTop = (today.getHours() + today.getMinutes() / 60 - startHour) * hourHeight;
  const showNow = nowTop >= 0 && nowTop <= (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  return (
    <div className="overflow-x-auto">
      <div className={cn(days.length > 3 && 'min-w-[640px]')}>
        <div
          className="grid grid-cols-[52px_repeat(var(--days),1fr)] gap-1.5 pb-3"
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
          <div aria-hidden>
            {hours.map((h) => (
              // Each label sits on its hour line: shift it up by half its own height, no margin.
              <div key={h} className="relative" style={{ height: hourHeight }}>
                <span className="absolute -top-1.5 right-2 text-2xs leading-3 text-fg-subtle tnum">
                  {hourLabel(h)}
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayEvents = events.filter((e) => sameDay(e.start, d));
            const placed = layoutEvents(dayEvents);
            return (
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
                {dayEvents.map((e) => {
                  const top =
                    (e.start.getHours() + e.start.getMinutes() / 60 - startHour) * hourHeight;
                  const height = Math.max(
                    ((e.end.getTime() - e.start.getTime()) / 3_600_000) * hourHeight - 3,
                    22,
                  );
                  const { column, columns } = placed.get(e.id) ?? { column: 0, columns: 1 };
                  return (
                    <EventBlock
                      key={e.id}
                      event={e}
                      compact={height < 44}
                      style={{
                        top: top + 1,
                        height,
                        left: `calc(${(column / columns) * 100}% + 3px)`,
                        width: `calc(${100 / columns}% - 6px)`,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  event,
  compact,
  style,
}: {
  event: CalendarEvent;
  compact: boolean;
  style: CSSProperties;
}) {
  const tone = event.tone ?? 'blue';
  const look = event.look ?? 'solid';
  const interactive = Boolean(event.popover || event.onOpen);
  const Tag = interactive ? 'button' : 'div';
  const time = (
    <span className={cn('text-2xs tnum', toneTime[tone])}>
      {timeLabel(event.start)}
      {!compact && `–${timeLabel(event.end)}`}
    </span>
  );
  const block = (
    <Tag
      type={interactive ? 'button' : undefined}
      aria-label={event.label}
      onClick={event.popover ? undefined : event.onOpen}
      onDoubleClick={event.onOpen}
      onKeyDown={
        event.popover && event.onOpen
          ? (keyEvent) => {
              if (keyEvent.key === 'Enter') {
                keyEvent.preventDefault();
                event.onOpen?.();
              }
            }
          : undefined
      }
      className={cn(
        'absolute z-[1] overflow-hidden rounded-[5px] border-l-[3px] text-left focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
        toneBox[tone],
        looks[look],
        interactive && 'hover:brightness-[0.97]',
      )}
      style={style}
    >
      {compact ? (
        <p className="truncate text-xs leading-4">
          {time} <span className="event-title font-semibold text-fg">{event.title}</span>
        </p>
      ) : (
        <>
          <p className="truncate leading-4">{time}</p>
          <p className="event-title truncate text-xs font-semibold text-fg">{event.title}</p>
          {event.subtitle && <p className="truncate text-2xs text-fg-muted">{event.subtitle}</p>}
        </>
      )}
    </Tag>
  );
  if (!event.popover) return block;
  return (
    <Popover>
      <PopoverTrigger asChild>{block}</PopoverTrigger>
      <PopoverContent className="w-80" side="right" align="start">
        {event.popover}
      </PopoverContent>
    </Popover>
  );
}

/** Monday-based week containing `date`. */
export function weekOf(date: Date, length = 5): Date[] {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
}
