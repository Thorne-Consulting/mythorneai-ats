'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Columns3, Download, Rows3, Rows4 } from 'lucide-react';
import {
  Button,
  Checkbox,
  IconButton,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Pagination,
  SelectionBar,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
  type SortDirection,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLocalStorageState } from '@/lib/hooks';
import { rowLinkProps } from '@/lib/row-link-props';
import { downloadCsv } from './csv';

export type Column<T> = {
  id: string;
  header: ReactNode;
  /** Plain-text name for the column picker and CSV header when `header` is not a string. */
  label?: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Text for CSV export; falls back to sortValue. Columns without either are skipped. */
  csv?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Can the user hide it? Default true. The first column should usually be false. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Pin to the right edge so it stays in view when the table scrolls sideways (row actions). */
  sticky?: boolean;
};

/** Which columns are hidden, the row size and the sort: kept per browser, or by a saved view. */
export type TableLayout = {
  hidden: string[];
  density: 'comfortable' | 'compact';
  sort: { id: string; dir: 'asc' | 'desc' } | null;
  /** Columns this layout has known. A `defaultHidden` column added later starts hidden. */
  seen?: string[];
};
type Persisted = TableLayout;

export type DataTableProps<T> = {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Persists hidden columns, density and sort per browser under this key. */
  viewKey?: string;
  /** A saved view's columns, row size and sort. While set, the table shows it instead of this browser's. */
  layout?: TableLayout | null;
  /** Called on every column, row size or sort change (with or without `layout`), so a view can save it. */
  onLayoutChange?: (layout: TableLayout) => void;
  /** Left side of the toolbar: search, filters. */
  toolbar?: ReactNode;
  /** A full-width line under the toolbar, for example the active filter chips. */
  subToolbar?: ReactNode;
  /** Row activation: a label for screen readers and the action. */
  onRowOpen?: (row: T) => void;
  rowLabel?: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Buttons shown in the selection bar. */
  bulkActions?: ReactNode;
  /** The count the selection bar shows when it differs from `selected` (for example "all 312 matching"). */
  selectionCount?: number;
  /** Client paging size; ignored when `pagination` is given (server paging). */
  pageSize?: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  noun?: string;
  loading?: boolean;
  empty?: ReactNode;
  exportName?: string;
  /** Show the built-in CSV export. Turn off when the page has its own (server) export. Default true. */
  exportable?: boolean;
  /**
   * Export through the server (every matching row, not one page). With server `pagination` and no
   * `onExport`, the Export button is hidden: the table only has the page it shows.
   */
  onExport?: () => void;
  /** Below `sm`, show each row as this stacked card instead of a sideways-scrolling table. */
  card?: (row: T) => ReactNode;
  /** Hide the column, density and export tools (short lists such as a person's files). */
  minimal?: boolean;
  /** Change it (for example to the filters) to go back to page 1 without remounting the table. */
  resetPageKey?: string;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
};

const stickyCell =
  'sticky right-0 z-[1] bg-card group-hover/row:bg-muted group-focus-visible/row:bg-accent group-data-[selected]/row:bg-accent';

const compare = (a: unknown, b: unknown) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

/**
 * The full table: toolbar, column picker, density, CSV export, sorting, selection with bulk
 * actions, client or server paging, loading and empty states. Built on the ui Table primitives.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  viewKey,
  layout,
  onLayoutChange,
  toolbar,
  subToolbar,
  onRowOpen,
  rowLabel,
  selectable,
  selected = [],
  onSelectedChange,
  bulkActions,
  selectionCount,
  pageSize = 25,
  pagination,
  noun = 'row',
  loading,
  empty,
  exportName,
  exportable = true,
  onExport,
  card,
  minimal,
  resetPageKey,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const [stored, setStored] = useLocalStorageState<Persisted>(`ats-table:${viewKey ?? 'default'}`, {
    hidden: columns.filter((c) => c.defaultHidden).map((c) => c.id),
    density: 'comfortable',
    sort: null,
    seen: columns.map((c) => c.id),
  });
  const raw = layout ?? stored;
  // Columns that arrived after this layout was made (a new custom field, say) follow their default.
  const persisted: Persisted = raw.seen
    ? {
        ...raw,
        hidden: [
          ...raw.hidden,
          ...columns.filter((c) => c.defaultHidden && !raw.seen!.includes(c.id)).map((c) => c.id),
        ],
      }
    : raw;
  const setPersisted = (change: (p: Persisted) => Persisted) => {
    const next = { ...change(persisted), seen: columns.map((c) => c.id) };
    if (!layout) setStored(next);
    onLayoutChange?.(next);
  };
  // A table with no saved state starts at the density chosen in My settings → Preferences.
  useEffect(() => {
    try {
      if (localStorage.getItem(`ats-table:${viewKey ?? 'default'}`) !== null) return;
      const pref = JSON.parse(localStorage.getItem('ats-pref:density') ?? 'null');
      if (pref === 'compact' || pref === 'comfortable') setStored((p) => ({ ...p, density: pref }));
    } catch {}
  }, [viewKey, setStored]);
  const [localPage, setLocalPage] = useState(1);
  useEffect(() => setLocalPage(1), [resetPageKey]);
  const visible = columns.filter((c) => !persisted.hidden.includes(c.id));
  const sortCol = persisted.sort && columns.find((c) => c.id === persisted.sort!.id && c.sortValue);

  const sorted = useMemo(() => {
    if (!sortCol || !persisted.sort) return data;
    const dir = persisted.sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => dir * compare(sortCol.sortValue!(a), sortCol.sortValue!(b)));
  }, [data, sortCol, persisted.sort]);

  const size = pagination?.pageSize ?? pageSize;
  const total = pagination?.total ?? sorted.length;
  // Filtering can shrink the data under the current page; clamp so we never show an empty page.
  const lastPage = Math.max(1, Math.ceil(total / size));
  const page = pagination?.page ?? Math.min(localPage, lastPage);
  const rows = pagination ? sorted : sorted.slice((page - 1) * size, page * size);
  const ids = rows.map(getRowId);
  const allOnPage = ids.length > 0 && ids.every((id) => selected.includes(id));
  const someOnPage = ids.some((id) => selected.includes(id));

  const toggleSort = (id: string) =>
    setPersisted((p) => ({
      ...p,
      sort:
        p.sort?.id !== id ? { id, dir: 'asc' } : p.sort.dir === 'asc' ? { id, dir: 'desc' } : null,
    }));
  const sortOf = (id: string): SortDirection =>
    persisted.sort?.id === id ? persisted.sort.dir : null;
  const label = (c: Column<T>) => c.label ?? (typeof c.header === 'string' ? c.header : c.id);

  const exportCsv = () => {
    const cols = visible.filter((c) => c.csv || c.sortValue);
    const head = cols.map(label);
    const body = sorted.map((r) =>
      cols.map((c) => {
        const v = c.csv ? c.csv(r) : c.sortValue!(r);
        return v instanceof Date ? v.toISOString() : (v as string | number | null | undefined);
      }),
    );
    downloadCsv(`${exportName ?? viewKey ?? 'export'}.csv`, [head, ...body]);
  };

  const compact = persisted.density === 'compact';
  const canExport = onExport ? true : exportable && !pagination && Boolean(exportName || viewKey);
  const openProps = (row: T) =>
    onRowOpen ? rowLinkProps(rowLabel?.(row) ?? 'Open', () => onRowOpen(row)) : undefined;
  const selectBox = (row: T, id: string, isSel: boolean) => (
    <Checkbox
      aria-label={`Select ${rowLabel?.(row) ?? id}`}
      checked={isSel}
      onCheckedChange={(on) =>
        onSelectedChange?.(on ? [...selected, id] : selected.filter((s) => s !== id))
      }
    />
  );
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-sm:basis-full">
          {toolbar}
        </div>
        <div className={cn('flex items-center gap-1.5', minimal && 'hidden')}>
          {/* Columns and row size only apply to the table, not the phone cards. */}
          <span className={cn('contents', card && 'max-sm:hidden')}>
            <Menu>
              <Tooltip label="Columns">
                <MenuTrigger asChild>
                  <IconButton label="Choose columns">
                    <Columns3 />
                  </IconButton>
                </MenuTrigger>
              </Tooltip>
              <MenuContent>
                <MenuLabel>Show columns</MenuLabel>
                {columns
                  .filter((c) => c.hideable !== false)
                  .map((c) => (
                    <MenuCheckboxItem
                      key={c.id}
                      checked={!persisted.hidden.includes(c.id)}
                      onCheckedChange={(on) =>
                        setPersisted((p) => ({
                          ...p,
                          hidden: on ? p.hidden.filter((h) => h !== c.id) : [...p.hidden, c.id],
                        }))
                      }
                    >
                      {label(c)}
                    </MenuCheckboxItem>
                  ))}
                <MenuSeparator />
                <MenuCheckboxItem
                  checked={compact}
                  onCheckedChange={(on) =>
                    setPersisted((p) => ({ ...p, density: on ? 'compact' : 'comfortable' }))
                  }
                >
                  Smaller rows
                </MenuCheckboxItem>
              </MenuContent>
            </Menu>
            <Tooltip label={compact ? 'Bigger rows' : 'Smaller rows'}>
              <IconButton
                label={compact ? 'Bigger rows' : 'Smaller rows'}
                onClick={() =>
                  setPersisted((p) => ({ ...p, density: compact ? 'comfortable' : 'compact' }))
                }
              >
                {compact ? <Rows3 /> : <Rows4 />}
              </IconButton>
            </Tooltip>
          </span>
          {canExport && (
            <Button
              variant="secondary"
              leftIcon={<Download />}
              onClick={onExport ?? exportCsv}
              disabled={!sorted.length}
            >
              Export
            </Button>
          )}
        </div>
      </div>
      {subToolbar}
      {selectable && onSelectedChange && (
        <SelectionBar
          count={selectionCount ?? selected.length}
          noun={noun}
          onClear={() => onSelectedChange([])}
        >
          {bulkActions}
        </SelectionBar>
      )}
      {loading ? (
        <SkeletonRows rows={6} className="px-0" />
      ) : rows.length === 0 ? (
        (empty ?? <p className="py-10 text-center text-sm text-fg-subtle">Nothing here yet.</p>)
      ) : (
        <>
          {card && (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle sm:hidden">
              {rows.map((row) => {
                const id = getRowId(row);
                const isSel = selected.includes(id);
                const open = openProps(row);
                return (
                  <li
                    key={id}
                    {...open}
                    className={cn(
                      'flex items-start gap-3 py-3 outline-none focus-visible:bg-accent',
                      open && 'cursor-pointer',
                      isSel && 'bg-accent',
                      rowClassName?.(row),
                    )}
                  >
                    {selectable && onSelectedChange && (
                      <span
                        className="pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {selectBox(row, id, isSel)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">{card(row)}</div>
                  </li>
                );
              })}
            </ul>
          )}
          <Table className={cn(compact && '[&_td]:h-9 [&_td]:py-1', card && 'hidden sm:table')}>
            <THead className="sticky top-0 z-[1]">
              <tr>
                {selectable && onSelectedChange && (
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                      onCheckedChange={(on) =>
                        onSelectedChange(
                          on
                            ? [...new Set([...selected, ...ids])]
                            : selected.filter((id) => !ids.includes(id)),
                        )
                      }
                    />
                  </TH>
                )}
                {visible.map((c) => (
                  <TH
                    key={c.id}
                    align={c.align}
                    className={cn(c.className, c.sticky && 'sticky right-0 z-[2]')}
                    sort={c.sortValue ? sortOf(c.id) : undefined}
                    onSort={c.sortValue ? () => toggleSort(c.id) : undefined}
                  >
                    {c.header}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const id = getRowId(row);
                const isSel = selected.includes(id);
                const open = openProps(row);
                return (
                  <TR
                    key={id}
                    interactive={!!onRowOpen}
                    selected={isSel}
                    {...open}
                    className={cn(open?.className, rowClassName?.(row))}
                  >
                    {selectable && onSelectedChange && (
                      <TD
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {selectBox(row, id, isSel)}
                      </TD>
                    )}
                    {visible.map((c) => (
                      <TD
                        key={c.id}
                        align={c.align}
                        className={cn(c.className, c.sticky && stickyCell)}
                      >
                        {c.cell(row)}
                      </TD>
                    ))}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}
      {!loading && total > 0 && !(minimal && total <= size) && (
        <Pagination
          page={page}
          pageSize={size}
          total={total}
          noun={`${noun}s`}
          onPageChange={pagination?.onPageChange ?? setLocalPage}
        />
      )}
    </div>
  );
}
