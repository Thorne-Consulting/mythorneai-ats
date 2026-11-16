'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { IconButton, SearchSelect, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  byDay,
  dayKey,
  dayLabel,
  monthGrid,
  shiftMonth,
  timeLabel,
  zoneOptions,
  type Slot,
} from './time';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Pick a day, then a time, in the reader's own time zone (detected, and changeable). Days with open
 * times are the only ones you can press. Shared by the booking page and the candidate portal.
 */
export function SlotPicker({
  slots,
  timeZone,
  onTimeZoneChange,
  value,
  onChange,
  loading,
  className,
}: {
  slots: Slot[];
  timeZone: string;
  onTimeZoneChange: (zone: string) => void;
  /** The chosen slot's startsAt. */
  value: string | null;
  onChange: (slot: Slot) => void;
  loading?: boolean;
  className?: string;
}) {
  const days = useMemo(() => byDay(slots, timeZone), [slots, timeZone]);
  const first = days.keys().next().value as string | undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.has(picked) ? picked : (first ?? null);
  const [shownMonth, setMonth] = useState<string | null>(null);
  const month = shownMonth ?? day ?? dayKey(new Date(), timeZone);
  const today = dayKey(new Date(), timeZone);
  const cells = monthGrid(month);
  const lastDay = [...days.keys()].at(-1);
  const times = day ? (days.get(day) ?? []) : [];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-end gap-2">
        <SearchSelect
          label={
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5" aria-hidden />
              Your time zone
            </span>
          }
          className="w-full sm:max-w-sm"
          value={timeZone}
          onChange={(zone) => zone && onTimeZoneChange(zone)}
          data={zoneOptions()}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-base font-semibold text-fg">
              {dayLabel(month, { weekday: undefined, day: undefined, year: 'numeric' })}
            </p>
            <div className="flex gap-1">
              <IconButton
                label="Previous month"
                size="sm"
                variant="quiet"
                disabled={month.slice(0, 7) <= today.slice(0, 7)}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                label="Next month"
                size="sm"
                variant="quiet"
                disabled={!lastDay || month.slice(0, 7) >= lastDay.slice(0, 7)}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight />
              </IconButton>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="Days">
            {WEEKDAYS.map((name) => (
              <span key={name} className="pb-1 text-2xs font-medium text-fg-subtle">
                {name}
              </span>
            ))}
            {cells.map((cell, index) => {
              if (!cell) return <span key={`blank-${index}`} />;
              const open = days.get(cell)?.length ?? 0;
              const selected = cell === day;
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={!open || loading}
                  aria-pressed={selected}
                  aria-label={`${dayLabel(cell)}${open ? `, ${open} ${open === 1 ? 'time' : 'times'} open` : ', no times'}`}
                  onClick={() => {
                    setPicked(cell);
                    setMonth(cell);
                  }}
                  className={cn(
                    'relative flex aspect-square items-center justify-center rounded-md text-sm tnum transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    open
                      ? 'font-semibold text-accent-foreground hover:bg-accent'
                      : 'text-fg-subtle opacity-60',
                    selected && 'bg-primary text-primary-foreground hover:bg-primary',
                    cell === today && !selected && 'ring-1 ring-border',
                  )}
                >
                  {Number(cell.slice(8))}
                  {open > 0 && !selected && (
                    <span
                      aria-hidden
                      className="absolute bottom-1 size-1 rounded-full bg-tone-blue-dot"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          {loading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 9 }, (_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : !day ? (
            <p className="text-base text-fg-muted">
              There are no open times right now. Message the hiring team and they will find one with
              you.
            </p>
          ) : (
            <>
              <p className="mb-2 text-base font-semibold text-fg">{dayLabel(day)}</p>
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                role="radiogroup"
                aria-label={`Times on ${dayLabel(day)}`}
              >
                {times.map((slot) => {
                  const on = slot.startsAt === value;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange(slot)}
                      className={cn(
                        'h-10 rounded-md border text-base font-medium tnum transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-accent-foreground hover:border-primary hover:bg-accent',
                      )}
                    >
                      {timeLabel(slot.startsAt, timeZone)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
