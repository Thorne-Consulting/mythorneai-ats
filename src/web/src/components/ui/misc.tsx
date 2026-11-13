import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 font-sans text-2xs font-medium text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Separator({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border-subtle',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

/** A divider with a centred label, e.g. "or". */
export function LabeledSeparator({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-fg-subtle">
      <Separator />
      <span className="shrink-0">{children}</span>
      <Separator />
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-secondary', className)}
      {...props}
    />
  );
}

/** Placeholder rows while a list loads. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn('space-y-4 p-5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-[34px] rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-2.5" style={{ width: `${60 - i * 6}%` }} />
            <Skeleton className="h-2" style={{ width: `${40 - i * 4}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Code({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        'rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-fg',
        className,
      )}
      {...props}
    />
  );
}

/** Small uppercase eyebrow label, e.g. "CANDIDATE JOURNEY". */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-2xs font-medium uppercase tracking-[0.06em] text-fg-subtle', className)}
      {...props}
    />
  );
}

/** Key/value list for record details (Email, Phone, Location...). */
export function DescriptionList({
  items,
  columns = 1,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-fg-subtle">{item.label}</dt>
          <dd className="mt-1 break-words text-base text-fg">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
