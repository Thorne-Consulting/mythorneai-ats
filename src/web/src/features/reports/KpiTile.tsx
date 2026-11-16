'use client';

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { delta as deltaOf } from './report-data';

type Delta = NonNullable<ReturnType<typeof deltaOf>>;

/**
 * A headline number that says what it counts. The label wraps instead of truncating; the hint
 * names the period or population; the change line compares with the previous period.
 */
export function KpiTile({
  label,
  value,
  hint,
  delta,
  versus,
  href,
  onOpen,
  openLabel,
}: {
  label: string;
  value: string;
  hint?: string | null;
  delta?: Delta | null;
  /** The previous value, for example "from 38". The page says once which period that was. */
  versus?: string | null;
  href?: string;
  onOpen?: () => void;
  /** Screen reader name for the link or button. */
  openLabel?: string;
}) {
  // Words ("Experience mismatch", "None yet") get a smaller size so they wrap instead of overflowing.
  const words = /[a-z]/i.test(value.replace(/days?|hours?/g, ''));
  const Arrow =
    delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  const body = (
    <>
      <p className="pr-6 text-sm leading-snug text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-bold text-fg tnum',
          words ? 'text-xl leading-snug break-words' : 'text-3xl leading-tight',
        )}
      >
        {value}
      </p>
      {delta && (
        <p className="mt-1.5 text-xs leading-snug">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold',
              delta.direction === 'flat'
                ? 'text-fg-muted'
                : delta.good
                  ? 'text-tone-green-fg'
                  : 'text-tone-red-fg',
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            {delta.text}
          </span>
          {versus && <span className="text-fg-subtle"> {versus}</span>}
        </p>
      )}
      {hint && <p className="mt-1 text-xs leading-snug text-fg-subtle">{hint}</p>}
      {(href || onOpen) && (
        <ChevronRight
          className="absolute top-4 right-3.5 size-4 text-fg-subtle print:hidden"
          aria-hidden
        />
      )}
    </>
  );
  const classes =
    'relative flex min-w-0 flex-col rounded-xl border border-border-subtle bg-card px-4 py-3.5 text-left shadow-card break-inside-avoid';
  const interactive = 'transition-colors hover:border-border hover:bg-muted';
  if (href)
    return (
      <Link href={href} aria-label={openLabel} className={cn(classes, interactive)}>
        {body}
      </Link>
    );
  if (onOpen)
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className={cn(classes, interactive)}
      >
        {body}
      </button>
    );
  return <div className={classes}>{body}</div>;
}

const columns: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1',
  4: 'grid-cols-2 xl:grid-cols-4',
};

/** A row of KpiTiles that sizes to how many there are, so three tiles never leave a hole. */
export function KpiGrid({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className={cn('grid gap-3 print:grid-cols-4', columns[count] ?? columns[4])}>
      {children}
    </div>
  );
}
