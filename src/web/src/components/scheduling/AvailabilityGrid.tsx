'use client';

import type { MouseEvent } from 'react';
import { CalendarCheck, CalendarOff } from 'lucide-react';
import { Avatar, Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { dayKey, minuteOfDay, timeLabel, type Slot } from './time';

export type GridPerson = {
  email: string;
  name: string;
  member: boolean;
  timeZone: string;
  calendar: 'Checked' | 'Missing';
  interviewsThisWeek: number;
  maxPerWeek?: number | null;
  working: Slot[];
  busy: Slot[];
};

export type GridSession = Slot & { label: string };

/** Where a time range falls on one day, in minutes from midnight, clipped to the day. */
function span(range: Slot, day: string, timeZone: string) {
  const startDay = dayKey(range.startsAt, timeZone);
  const endDay = dayKey(range.endsAt, timeZone);
  if (endDay < day || startDay > day) return null;
  const start = startDay < day ? 0 : minuteOfDay(range.startsAt, timeZone);
  const end = endDay > day ? 1440 : minuteOfDay(range.endsAt, timeZone) || 1440;
  return end > start ? { start, end } : null;
}

/**
 * One day for a panel: each person's working hours and busy times on a row, the times open for
 * everyone on top, and the chosen sessions. Click an open band to pick that time.
 */
export function AvailabilityGrid({
  day,
  timeZone,
  people,
  open,
  sessions,
  startHour,
  endHour,
  onPick,
}: {
  /** "2026-11-19" in timeZone. */
  day: string;
  timeZone: string;
  people: GridPerson[];
  /** Ranges where the first session could run for everyone. */
  open: Slot[];
  sessions: GridSession[];
  startHour: number;
  endHour: number;
  /** Minutes from midnight, snapped to 15. */
  onPick: (minute: number) => void;
}) {
  const from = startHour * 60;
  const length = (endHour - startHour) * 60;
  const place = (start: number, end: number) => {
    const left = Math.max(0, (start - from) / length);
    const right = Math.min(1, (end - from) / length);
    return right > left ? { left: `${left * 100}%`, width: `${(right - left) * 100}%` } : null;
  };
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const label = (hour: number) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 1, hour % 24)),
    );
  const pick = (event: MouseEvent<HTMLButtonElement>, band: { start: number; end: number }) => {
    const track = event.currentTarget.parentElement!.getBoundingClientRect();
    const minute = from + ((event.clientX - track.left) / track.width) * length;
    const snapped = event.detail === 0 ? band.start : Math.floor(minute / 15) * 15;
    onPick(Math.min(Math.max(snapped, band.start), band.end));
  };
  const sessionBlocks = sessions
    .map((session) => ({ session, at: span(session, day, timeZone) }))
    .filter((x) => x.at);

  const Row = ({ children, head }: { children: React.ReactNode; head: React.ReactNode }) => (
    <div className="grid grid-cols-[148px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="min-w-0">{head}</div>
      <div className="relative h-9 overflow-hidden rounded-md bg-muted">
        {children}
        {sessionBlocks.map(({ session, at }) => {
          const style = place(at!.start, at!.end);
          return (
            style && (
              <span
                key={session.startsAt}
                aria-hidden
                style={style}
                className="pointer-events-none absolute inset-y-0 border-x-2 border-primary bg-primary/15"
              />
            )
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] space-y-1.5">
        <div className="grid grid-cols-[148px_minmax(0,1fr)] gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <span />
          <div className="relative h-4 text-2xs text-fg-subtle tnum" aria-hidden>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                style={{ left: `${((hour * 60 - from) / length) * 100}%` }}
              >
                {label(hour)}
              </span>
            ))}
          </div>
        </div>

        <Row head={<p className="text-sm font-semibold text-fg">Open for everyone</p>}>
          {open
            .map((range) => span(range, day, timeZone))
            .filter((band): band is { start: number; end: number } => band !== null)
            .map((band) => {
              const style = place(band.start, band.end);
              return (
                style && (
                  <button
                    key={band.start}
                    type="button"
                    style={style}
                    onClick={(event) => pick(event, band)}
                    aria-label={`Open from ${timeLabel(new Date(Date.UTC(2026, 0, 1, 0, band.start)), 'UTC')} to ${timeLabel(new Date(Date.UTC(2026, 0, 1, 0, band.end)), 'UTC')}. Press to pick a time.`}
                    className="absolute inset-y-1 cursor-pointer rounded-sm bg-tone-green-bg ring-1 ring-tone-green-dot/40 ring-inset transition-colors hover:bg-tone-green-dot/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                )
              );
            })}
        </Row>

        {people.map((person) => (
          <Row
            key={person.email}
            head={
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={person.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{person.name}</p>
                  <p className="flex items-center gap-1 truncate text-2xs text-fg-subtle">
                    <Tooltip
                      label={
                        person.calendar === 'Checked'
                          ? 'Calendar checked'
                          : person.member
                            ? 'No calendar connected: only their hours and MyThorneAI interviews are known'
                            : 'Not on the team: nothing is known about their time'
                      }
                    >
                      <span
                        tabIndex={0}
                        className="inline-flex rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {person.calendar === 'Checked' ? (
                          <CalendarCheck
                            className="size-3 text-tone-green-dot"
                            aria-label="Calendar checked"
                          />
                        ) : (
                          <CalendarOff
                            className="size-3 text-tone-amber-dot"
                            aria-label="Calendar not checked"
                          />
                        )}
                      </span>
                    </Tooltip>
                    <span className="tnum">
                      {person.interviewsThisWeek}
                      {person.maxPerWeek ? ` of ${person.maxPerWeek}` : ''} this week
                    </span>
                  </p>
                </div>
              </div>
            }
          >
            {person.working
              .map((range) => span(range, day, timeZone))
              .filter((band) => band !== null)
              .map((band) => {
                const style = place(band!.start, band!.end);
                return (
                  style && (
                    <span
                      key={`w${band!.start}`}
                      style={style}
                      className="absolute inset-y-0 bg-card ring-1 ring-border-subtle ring-inset"
                    />
                  )
                );
              })}
            {person.busy
              .map((range) => span(range, day, timeZone))
              .filter((band) => band !== null)
              .map((band) => {
                const style = place(band!.start, band!.end);
                return (
                  style && (
                    <span
                      key={`b${band!.start}-${band!.end}`}
                      style={style}
                      className={cn(
                        'absolute inset-y-1 rounded-sm bg-tone-gray-dot/45',
                        'bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(0_0_0/0.08)_4px_8px)]',
                      )}
                      title="Busy"
                    />
                  )
                );
              })}
          </Row>
        ))}

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-2xs text-fg-subtle">
          <Legend className="bg-tone-green-bg ring-1 ring-tone-green-dot/40">
            Open for everyone
          </Legend>
          <Legend className="bg-card ring-1 ring-border">Working hours</Legend>
          <Legend className="bg-tone-gray-dot/45">Busy</Legend>
          <Legend className="border-x-2 border-primary bg-primary/15">Your pick</Legend>
        </div>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('inline-block h-3 w-5 rounded-sm', className)} />
      {children}
    </span>
  );
}
