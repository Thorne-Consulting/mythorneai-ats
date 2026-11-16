import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Figma data table: soft header band, 12px header labels, ~50px rows with a hairline divider,
 * hover wash, selected rows in the primary wash. Wrap in a Card; the table scrolls sideways
 * on small screens instead of squashing columns.
 */
export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full border-separate border-spacing-0 text-base', className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('[&_th:first-child]:rounded-l-md [&_th:last-child]:rounded-r-md', className)}
      {...props}
    />
  );
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({
  selected,
  interactive,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; interactive?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'group/row transition-colors',
        interactive &&
          'cursor-pointer hover:bg-muted focus-visible:bg-accent focus-visible:outline-none',
        selected && 'bg-accent hover:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = 'asc' | 'desc' | null;

export function TH({
  className,
  children,
  sort,
  onSort,
  align,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  sort?: SortDirection;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}) {
  const content = onSort ? (
    <button type="button" onClick={onSort} className="inline-flex items-center gap-1 hover:text-fg">
      {children}
      {sort === 'asc' ? (
        <ArrowUp className="size-3" />
      ) : sort === 'desc' ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-50" />
      )}
    </button>
  ) : (
    children
  );
  return (
    <th
      scope="col"
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      className={cn(
        'relative h-[37px] whitespace-nowrap bg-muted px-3 text-left text-xs font-normal text-fg-muted first:pl-4 last:pr-4',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {content}
    </th>
  );
}

export function TD({
  className,
  align,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'relative h-[50px] border-b border-border-subtle px-3 py-2 align-middle text-sm text-fg first:pl-4 last:pr-4 group-last/row:border-b-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  );
}

/** Bold primary line + muted secondary line, e.g. "Software Engineer / Engineering · JOB-024". */
export function CellStack({
  primary,
  secondary,
  className,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate font-medium text-fg">{primary}</div>
      {secondary && <div className="mt-0.5 truncate text-xs text-fg-subtle">{secondary}</div>}
    </div>
  );
}

/** Table toolbar: search on the left, filters on the right. Sits above the table inside the card. */
export function TableToolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2 py-3', className)}>{children}</div>;
}

/** Bulk-action bar shown when rows are selected (Figma "2 members selected"). */
export function SelectionBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  onClear: () => void;
  children?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent px-4 py-2.5">
      <p className="mr-auto text-base font-medium text-accent-foreground">
        {count} {noun}
        {count === 1 ? '' : 's'} selected
      </p>
      {children}
      <button
        type="button"
        onClick={onClear}
        className="h-8 rounded-md border border-border bg-card px-3 text-sm font-medium text-fg-muted hover:text-fg"
      >
        Clear
      </button>
    </div>
  );
}
