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
};

type Persisted = {
  hidden: string[];
  density: 'comfortable' | 'compact';
  sort: { id: string; dir: 'asc' | 'desc' } | null;
};

export type DataTableProps<T> = {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Persists hidden columns, density and sort per browser under this key. */
  viewKey?: string;
  /** Left side of the toolbar: search, filters. */
  toolbar?: ReactNode;
  /** Row activation: a label for screen readers and the action. */
  onRowOpen?: (row: T) => void;
  rowLabel?: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Buttons shown in the selection bar. */
  bulkActions?: ReactNode;
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
  className?: string;
  rowClassName?: (row: T) => string | undefined;
};

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
  toolbar,
  onRowOpen,
  rowLabel,
  selectable,
  selected = [],
  onSelectedChange,
  bulkActions,
  pageSize = 25,
  pagination,
  noun = 'row',
  loading,
  empty,
  exportName,
  exportable = true,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const [persisted, setPersisted] = useLocalStorageState<Persisted>(
    `ats-table:${viewKey ?? 'default'}`,
    {
      hidden: columns.filter((c) => c.defaultHidden).map((c) => c.id),
      density: 'comfortable',
      sort: null,
    },
  );
  // A table with no saved state starts at the density chosen in My settings → Preferences.
  useEffect(() => {
    try {
      if (localStorage.getItem(`ats-table:${viewKey ?? 'default'}`) !== null) return;
      const pref = JSON.parse(localStorage.getItem('ats-pref:density') ?? 'null');
      if (pref === 'compact' || pref === 'comfortable')
        setPersisted((p) => ({ ...p, density: pref }));
    } catch {}
  }, [viewKey, setPersisted]);
  const [localPage, setLocalPage] = useState(1);
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
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex items-center gap-1.5">
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
                Compact rows
              </MenuCheckboxItem>
            </MenuContent>
          </Menu>
          <Tooltip label={compact ? 'Comfortable rows' : 'Compact rows'}>
            <IconButton
              label={compact ? 'Comfortable rows' : 'Compact rows'}
              onClick={() =>
                setPersisted((p) => ({ ...p, density: compact ? 'comfortable' : 'compact' }))
              }
            >
              {compact ? <Rows3 /> : <Rows4 />}
            </IconButton>
          </Tooltip>
          {exportable && (exportName || viewKey) && (
            <Button
              variant="secondary"
              leftIcon={<Download />}
              onClick={exportCsv}
              disabled={!sorted.length}
            >
              Export
            </Button>
          )}
        </div>
      </div>
      {selectable && onSelectedChange && (
        <SelectionBar count={selected.length} noun={noun} onClear={() => onSelectedChange([])}>
          {bulkActions}
        </SelectionBar>
      )}
      {loading ? (
        <SkeletonRows rows={6} className="px-0" />
      ) : rows.length === 0 ? (
        (empty ?? <p className="py-10 text-center text-sm text-fg-subtle">Nothing to show.</p>)
      ) : (
        <Table className={cn(compact && '[&_td]:h-9 [&_td]:py-1')}>
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
                  className={c.className}
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
              const open = onRowOpen
                ? rowLinkProps(rowLabel?.(row) ?? 'Open', () => onRowOpen(row))
                : undefined;
              return (
                <TR
                  key={id}
                  interactive={!!onRowOpen}
                  selected={isSel}
                  {...open}
                  className={cn(open?.className, rowClassName?.(row))}
                >
                  {selectable && onSelectedChange && (
                    <TD onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${rowLabel?.(row) ?? id}`}
                        checked={isSel}
                        onCheckedChange={(on) =>
                          onSelectedChange(
                            on ? [...selected, id] : selected.filter((s) => s !== id),
                          )
                        }
                      />
                    </TD>
                  )}
                  {visible.map((c) => (
                    <TD key={c.id} align={c.align} className={c.className}>
                      {c.cell(row)}
                    </TD>
                  ))}
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {!loading && total > 0 && (
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
