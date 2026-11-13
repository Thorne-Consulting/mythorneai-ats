'use client';

import { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Trash2,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/api';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FilterSelect,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Tone,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { RequisitionSummary } from '@/types';
import { type ReportChart, ReportChartView } from './ReportChartView';
import { type Cell, type Filters, isIsoDate, queryString, reportMeta } from './report-data';
import { savedViewHref, useSavedReportViews } from './ReportsShell';

export interface ReportTable {
  key: string;
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  note?: string | null;
  stats?: { label: string; value: string }[] | null;
  charts?: ReportChart[] | null;
}

export const cellText = (cell: Cell) =>
  cell === null || cell === ''
    ? '—'
    : typeof cell === 'number'
      ? String(Math.round(cell * 10) / 10)
      : isIsoDate(cell)
        ? formatDate(cell.slice(0, 10))
        : cell;

export const statLook: { icon: LucideIcon; tone: Tone }[] = [
  { icon: BarChart3, tone: 'blue' },
  { icon: Clock, tone: 'violet' },
  { icon: CheckCircle2, tone: 'green' },
  { icon: Trophy, tone: 'amber' },
];

export function useReport(key: string, filters: Filters, enabled = true) {
  return useQuery({
    queryKey: ['report', key, filters],
    queryFn: () => api.get<ReportTable>(`/api/reports/${key}?${queryString({ ...filters })}`),
    enabled: enabled && !!key,
    retry: false,
  });
}

export function useJobOptions() {
  const jobs = useQuery({
    queryKey: ['requisitions-list'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  return jobs.data ?? [];
}

/** Job, source and applied-date filters shared by every report and the builder. */
export function ReportFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const jobs = useJobOptions();
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <FilterSelect
        allLabel="All jobs"
        aria-label="Job"
        value={filters.requisitionId || null}
        onChange={(value) => onChange({ requisitionId: value ?? '' })}
        data={jobs.map((job) => ({ value: job.id, label: `${job.title} (${job.code})` }))}
      />
      <Input
        aria-label="Source"
        placeholder="Any source"
        className="w-40"
        value={filters.source}
        onChange={(event) => onChange({ source: event.currentTarget.value })}
      />
      <Input
        type="date"
        aria-label="Applied from"
        title="Applied from"
        className="w-[150px]"
        value={filters.from}
        onChange={(event) => onChange({ from: event.currentTarget.value })}
      />
      <span className="text-sm text-fg-subtle">to</span>
      <Input
        type="date"
        aria-label="Applied to"
        title="Applied to"
        className="w-[150px]"
        value={filters.to}
        onChange={(event) => onChange({ to: event.currentTarget.value })}
      />
      {hasFilters && (
        <Button
          variant="quiet"
          onClick={() => onChange({ requisitionId: '', source: '', from: '', to: '' })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

type Row = { id: string; cells: Cell[] };

/** One report on its own route: filters in the URL, stats, charts, a sortable details table. */
export function ReportView({ reportKey }: { reportKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const jobs = useJobOptions();
  const filters: Filters = {
    requisitionId: search.get('requisitionId') ?? '',
    source: search.get('source') ?? '',
    from: search.get('from') ?? '',
    to: search.get('to') ?? '',
  };
  const table = useReport(reportKey, filters);
  const views = useSavedReportViews();
  const [viewName, setViewName] = useState('');
  const [viewsOpen, setViewsOpen] = useState(false);
  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/saved-views', {
        area: 'reports',
        name: viewName.trim(),
        paramsJson: JSON.stringify({ report: reportKey, ...filters }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'reports'] });
      toast.success(`Saved view “${viewName.trim()}”`);
      setViewName('');
    },
    onError: (error: Error) => toast.error('Could not save the view', error.message),
  });
  const deleteView = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'reports'] });
      toast.success('Saved view removed');
    },
    onError: (error: Error) => toast.error('Could not remove the view', error.message),
  });

  const go = (next: Partial<Filters>) => {
    const qs = queryString({ ...filters, ...next });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const data = table.data;
  const title = data?.title ?? reportMeta(reportKey)?.title ?? 'Report';
  const csvHref = `/api/reports/${reportKey}?${queryString({ ...filters, format: 'csv' })}`;
  const hasFilters = Object.values(filters).some(Boolean);
  // Printed at the top of the PDF so the reader knows what the numbers cover.
  const filterSummary = [
    filters.requisitionId &&
      (jobs.find((job) => job.id === filters.requisitionId)?.title ?? 'One job'),
    filters.source && `Source: ${filters.source}`,
    (filters.from || filters.to) &&
      `Applied ${filters.from ? `from ${formatDate(filters.from)}` : ''} ${filters.to ? `to ${formatDate(filters.to)}` : ''}`.trim(),
  ]
    .filter(Boolean)
    .join(' · ');
  const clearFilters = () => go({ requisitionId: '', source: '', from: '', to: '' });
  const savedViews = views.data ?? [];

  const rows: Row[] = (data?.rows ?? []).map((cells, index) => ({ id: String(index), cells }));
  const numeric = (column: number) =>
    !!data && data.rows.some((row) => typeof row[column] === 'number');
  const columns: Column<Row>[] = (data?.columns ?? []).map((name, index) => ({
    id: name,
    header: name,
    cell: (row) => cellText(row.cells[index]),
    sortValue: (row) => row.cells[index],
    csv: (row) => row.cells[index],
    align: numeric(index) ? 'right' : 'left',
    className: index === 0 ? 'font-medium' : numeric(index) ? 'tnum' : undefined,
    hideable: index !== 0,
  }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: title }]}
        title={title}
        description={data?.description ?? reportMeta(reportKey)?.blurb}
        actions={
          <>
            <Button variant="secondary" className="print:hidden" onClick={() => setViewsOpen(true)}>
              Saved views{savedViews.length > 0 && ` (${savedViews.length})`}
            </Button>
            <Button
              variant="secondary"
              className="print:hidden"
              leftIcon={<FileText />}
              disabled={!data}
              onClick={() => window.print()}
            >
              Download PDF
            </Button>
            <Button asChild className="print:hidden">
              <a href={csvHref}>
                <Download />
                Export report
              </a>
            </Button>
          </>
        }
      >
        <ReportFilters filters={filters} onChange={go} />
      </PageHeader>

      {table.isLoading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : table.error ? (
        <Alert tone="danger" title="This report didn’t load">
          {table.error.message} Try again, or change the filters.
        </Alert>
      ) : data ? (
        <div className="flex flex-col gap-4">
          {reportKey === 'hires' && (
            <p className="text-sm text-fg">
              This list is for the HR and payroll hand-off. Export it as a CSV and send it on when
              someone has been hired.
            </p>
          )}
          <p className="hidden text-xs text-fg-subtle print:block">
            {filterSummary || 'All jobs and sources'} · Printed{' '}
            {formatDate(new Date().toISOString())}
          </p>

          {(data.stats?.length ?? 0) > 0 && (
            <StatGrid>
              {data.stats!.map((stat, index) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  icon={statLook[index % statLook.length].icon}
                  tone={statLook[index % statLook.length].tone}
                />
              ))}
            </StatGrid>
          )}

          {data.note && <Alert tone="neutral">{data.note}</Alert>}

          {data.rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={BarChart3}
                title="Nothing to report yet"
                description={
                  hasFilters
                    ? 'No data matches these filters.'
                    : 'This report fills in as people apply and move through hiring.'
                }
                action={
                  hasFilters && (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <>
              {(data.charts?.length ?? 0) > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {data.charts!.map((item) => (
                    <ReportChartView key={item.title} chart={item} />
                  ))}
                </div>
              )}
              <Card className="break-inside-avoid px-4">
                <DataTable
                  exportable={false}
                  data={rows}
                  columns={columns}
                  getRowId={(row) => row.id}
                  viewKey={`report-${reportKey}`}
                  exportName={`${reportKey}-visible-columns`}
                  noun="row"
                  // ponytail: every row on one page so the printed PDF has them all; reports are
                  // grouped (stages, jobs, people), so they stay small.
                  pageSize={Math.max(25, rows.length)}
                  toolbar={
                    <p className="text-sm font-semibold text-fg">
                      Details{' '}
                      <span className="font-normal text-fg-subtle">
                        · {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                      </span>
                    </p>
                  }
                  className="print:[&>div:first-child]:hidden"
                />
              </Card>
            </>
          )}
        </div>
      ) : null}

      <Modal
        opened={viewsOpen}
        onClose={() => setViewsOpen(false)}
        title="Saved views"
        description="Save the report and filters you check often, then reopen them in one click."
        size="sm"
      >
        {savedViews.length > 0 && (
          <ul className="mb-4 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {savedViews.map((view) => (
              <li key={view.id} className="flex items-center gap-2 py-1 pr-1.5 pl-3">
                <button
                  type="button"
                  onClick={() => {
                    setViewsOpen(false);
                    router.push(savedViewHref(view));
                  }}
                  className="min-w-0 flex-1 truncate py-1.5 text-left text-base text-accent-foreground hover:underline"
                >
                  {view.name}
                </button>
                <IconButton
                  label={`Remove saved view ${view.name}`}
                  variant="quiet"
                  size="sm"
                  onClick={() => deleteView.mutate(view.id)}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (viewName.trim()) saveView.mutate();
          }}
        >
          <Input
            label="Save the current report and filters"
            placeholder="Name this view"
            className="flex-1"
            value={viewName}
            onChange={(event) => setViewName(event.currentTarget.value)}
          />
          <Button type="submit" loading={saveView.isPending} disabled={!viewName.trim()}>
            Save
          </Button>
        </form>
      </Modal>
    </>
  );
}
