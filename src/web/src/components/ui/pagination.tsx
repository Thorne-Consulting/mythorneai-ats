'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { pageList } from './page-list';

export { pageList };

/**
 * Figma pagination: "Showing 1–7 of 18 jobs" on the left, Previous · pages · Next on the right.
 * Pass `total` items and `pageSize`; page is 1-based.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = 'results',
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'inline-flex h-[38px] items-center gap-1.5 rounded-md border border-border bg-card px-3 text-base font-medium text-fg-muted transition-colors hover:bg-accent hover:text-fg disabled:pointer-events-none disabled:opacity-50';
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 py-3', className)}>
      <p className="text-xs text-fg-subtle tnum">
        Showing {from}–{to} of {total} {noun}
      </p>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <button
            type="button"
            className={btn}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Previous</span>
          </button>
          {pageList(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-fg-subtle">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  'inline-flex size-[30px] items-center justify-center rounded-md text-sm text-fg-muted tnum hover:bg-secondary',
                  p === page && 'bg-accent font-medium text-accent-foreground hover:bg-accent',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={btn}
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            <span className="max-sm:sr-only">Next</span>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
