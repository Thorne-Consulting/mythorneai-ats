'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/api';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { DrillDrawer, type DrillRequest } from './DrillDrawer';
import { KpiGrid, KpiTile } from './KpiTile';
import { ReportChartView } from './ReportChartView';
import { ChartBuilder, ChartBuilderButton } from './ChartBuilder';
import { CLEARED, ReportFilters } from './ReportFilters';
import {
  BREAKDOWN_LABELS,
  filtersFrom,
  formatNumber,
  isIsoDate,
  percentColumn,
  queryString,
  withDrill,
  type Cell,
  type Drill,
  type Filters,
  type ReportInfo,
  type ReportSection,
  type ReportTable,
} from './report-data';
import { useReport, useReportCatalog, useReportOptions } from './queries';
import { SavedViewsBar } from './SavedViewsBar';

export const cellText = (cell: Cell, percent = false) =>
  cell === null || cell === ''
    ? '—'
    : typeof cell === 'number'
      ? formatNumber(cell, percent)
      : isIsoDate(cell)
        ? formatDate(cell)
        : cell;

type Row = { id: string; cells: Cell[]; drill: Drill | null };

/** What the rows of a table are ("hire", "stage"), from its first column. */
function nounOf(firstColumn = '') {
  const nouns: Record<string, string> = {
    Name: 'hire',
    'AI fit score': 'score range',
    'Stage reached': 'stage',
    Candidate: 'offer',
  };
  return nouns[firstColumn] ?? firstColumn.toLowerCase();
}

/** "6 stages", "1 hire". */
function countOf(firstColumn: string, count: number) {
  const noun = nounOf(firstColumn);
  return `${count.toLocaleString('en-US')} ${count === 1 ? noun : `${noun}s`}`;
}

function columnsOf(names: string[], rows: Cell[][], hidden?: string[] | null): Column<Row>[] {
  return names.map((name, index) => {
    const { header, percent } = percentColumn(name);
    const numeric = rows.some((row) => typeof row[index] === 'number');
    const date = rows.some((row) => isIsoDate(row[index]));
    return {
      id: name,
      header,
      label: header,
      cell: (row) => cellText(row.cells[index], percent),
      sortValue: (row) => row.cells[index],
      csv: (row) => row.cells[index],
      align: numeric ? 'right' : 'left',
      // On a phone the table scrolls sideways instead of squeezing dates and words into columns.
      className:
        index === 0
          ? 'min-w-36 font-medium'
          : numeric || date
            ? 'tnum whitespace-nowrap'
            : 'min-w-32',
      hideable: index !== 0,
      defaultHidden: hidden?.includes(name),
    };
  });
}

const rowsOf = (cells: Cell[][], drill?: (Drill | null)[] | null): Row[] =>
  cells.map((row, index) => ({ id: String(index), cells: row, drill: drill?.[index] ?? null }));

/** One report on its own route: filters and views in the URL, numbers, charts, tables, drill-down. */
export function ReportView({ reportKey }: { reportKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = filtersFrom(search);
  const viewId = search.get('view');
  const catalog = useReportCatalog();
  const info = catalog.data?.find((report) => report.key === reportKey);
  const report = useReport(reportKey, { ...filters });
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const [builder, setBuilder] = useState(false);

  const go = (next: Partial<Filters>) => {
    const qs = queryString({ ...filters, ...next, view: viewId ?? undefined });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const open = (title: string, target?: Drill | null) => {
    if (!target) return;
    if (target.applicationId) return router.push(`/applications/${target.applicationId}`);
    setDrill({ title, params: { ...withDrill(filters, target), report: reportKey } });
  };

  const data = report.data;
  const title = info?.title ?? data?.title ?? 'Report';
  const filtered = Object.keys(CLEARED).some((key) => filters[key as keyof Filters]);

  if (report.error instanceof ApiError && report.error.status === 404)
    return (
      <>
        <PageHeader
          breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Not found' }]}
          title="Report not found"
        />
        <Card>
          <EmptyState
            icon={BarChart3}
            title="This report doesn’t exist"
            description="It may have been renamed. Pick a report from the list, or go back to the overview."
            action={
              <Button asChild variant="secondary">
                <Link href="/reports">Go to the overview</Link>
              </Button>
            }
          />
        </Card>
      </>
    );

  return (
    <>
      {data && <PrintHeader data={data} info={info} filters={filters} />}
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: title }]}
        title={title}
        description={info?.description}
        actions={<ExportMenu reportKey={reportKey} filters={filters} disabled={!data} />}
        className="print:mb-3 print:[&_nav]:hidden"
      >
        <ReportFilters info={info} filters={filters} onChange={go} />
        <SavedViewsBar report={reportKey} filters={filters} viewId={viewId} />
      </PageHeader>

      {report.isLoading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : report.error ? (
        <Alert tone="danger" title="This report didn’t load">
          {report.error.message} Try again, or change the filters.
        </Alert>
      ) : data ? (
        <div
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            report.isPlaceholderData && 'opacity-60',
          )}
        >
          {(data.stats?.length ?? 0) > 0 && (
            <KpiGrid count={data.stats!.length}>
              {data.stats!.map((stat) => (
                <KpiTile
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  hint={stat.hint}
                  onOpen={stat.drill ? () => open(stat.label, stat.drill) : undefined}
                  openLabel={
                    stat.drill ? `${stat.label}: ${stat.value}. See these applications` : undefined
                  }
                />
              ))}
            </KpiGrid>
          )}

          {data.note && <Alert tone="neutral">{data.note}</Alert>}

          {data.rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={BarChart3}
                title="Nothing to report yet"
                description={
                  filtered
                    ? 'Nothing matches these filters. Clear them to see everything.'
                    : 'This report fills in as people apply and move through hiring.'
                }
                action={
                  filtered && (
                    <Button variant="secondary" onClick={() => go(CLEARED)}>
                      Clear filters
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <>
              {((data.charts?.length ?? 0) > 0 || builder) && (
                <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-1 [&>*:last-child:nth-child(odd)]:lg:col-span-2">
                  <ChartBuilder
                    id={`${reportKey}:${data.groupBy || 'rows'}`}
                    columns={data.columns}
                    rows={data.rows}
                    open={builder}
                    onClose={() => setBuilder(false)}
                  />
                  {data.charts?.map((chart) => (
                    <ReportChartView
                      key={chart.title}
                      chart={chart}
                      onSelect={(index) =>
                        open(
                          `${chart.title}: ${chart.rows[index]?.[0] ?? ''}`,
                          chart.drill?.[index],
                        )
                      }
                    />
                  ))}
                </div>
              )}
              <Card className={cn('px-4 break-inside-avoid', PRINT_TABLE)}>
                <DataTable
                  exportable={false}
                  data={rowsOf(data.rows, data.rowDrill)}
                  columns={columnsOf(data.columns, data.rows, data.hiddenColumns)}
                  getRowId={(row) => row.id}
                  viewKey={`report-${reportKey}-${data.groupBy || 'rows'}`}
                  noun={nounOf(data.columns[0])}
                  // ponytail: every row on one page so the printed PDF has them all; report tables are
                  // grouped (stages, jobs, people), so they stay small.
                  pageSize={Math.max(25, data.rows.length)}
                  onRowOpen={
                    data.rowDrill?.some(Boolean)
                      ? (row) => open(String(row.cells[0] ?? ''), row.drill)
                      : undefined
                  }
                  rowLabel={(row) =>
                    row.drill?.applicationId
                      ? `Open the application for ${row.cells[0]}`
                      : `See the applications for ${row.cells[0]}`
                  }
                  toolbar={
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-semibold text-fg">
                        {data.groupBy
                          ? `By ${BREAKDOWN_LABELS[data.groupBy]?.toLowerCase() ?? data.groupBy}`
                          : 'Details'}{' '}
                        <span className="font-normal text-fg-subtle">
                          · {countOf(data.columns[0], data.rows.length)}
                        </span>
                      </p>
                      <ChartBuilderButton open={builder} onClick={() => setBuilder(true)} />
                    </div>
                  }
                  className="print:[&>div:first-child]:hidden"
                />
              </Card>
              {data.sections?.map((section) => (
                <SectionCard
                  key={section.key}
                  reportKey={reportKey}
                  section={section}
                  onOpen={open}
                />
              ))}
            </>
          )}
        </div>
      ) : null}
      <DrillDrawer request={drill} onClose={() => setDrill(null)} />
    </>
  );
}

function ExportMenu({
  reportKey,
  filters,
  disabled,
}: {
  reportKey: string;
  filters: Filters;
  disabled: boolean;
}) {
  const csv = `/api/reports/${reportKey}?${queryString({ ...filters, format: 'csv' })}`;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="secondary"
          leftIcon={<Download />}
          disabled={disabled}
          className="print:hidden"
        >
          Export
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<FileSpreadsheet />} onSelect={() => window.location.assign(csv)}>
          Spreadsheet (CSV)
        </MenuItem>
        {/* The browser's print window saves a PDF; a print stylesheet hides the app around the report. */}
        <MenuItem icon={<Printer />} onSelect={() => setTimeout(() => window.print(), 100)}>
          Print or save as PDF
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Printed above the report so a PDF says whose numbers these are, what they cover and when. */
function PrintHeader({
  data,
  info,
  filters,
}: {
  data: ReportTable;
  info?: ReportInfo;
  filters: Filters;
}) {
  const options = useReportOptions().data;
  const verbs: Record<string, string> = {
    hired: 'Hired',
    interview: 'Interviews',
    offer: 'Offers sent',
  };
  const verb = verbs[info?.dateField ?? ''] ?? 'Applied';
  const parts = [
    `${verb}: ${data.period ?? 'All time'}`,
    filters.requisitionId &&
      `Job: ${options?.jobs.find((job) => job.value === filters.requisitionId)?.label ?? 'one job'}`,
    filters.department && `Department: ${filters.department}`,
    filters.source && `Source: ${filters.source}`,
    filters.recruiter &&
      `Recruiter: ${options?.recruiters.find((r) => r.value === filters.recruiter)?.label ?? filters.recruiter}`,
    data.groupBy && `Broken down by ${BREAKDOWN_LABELS[data.groupBy]?.toLowerCase()}`,
  ].filter(Boolean);
  return (
    <div className="mb-4 hidden border-b border-border pb-3 print:block">
      <p className="text-sm font-semibold text-fg">{data.organization || 'MyThorneAI'}</p>
      <p className="text-xs text-fg-muted">
        {parts.join(' · ')} · Printed {formatDate(new Date().toISOString())}
      </p>
    </div>
  );
}

/** In print, tables fit the page width: headers wrap, cells tighten, nothing scrolls off the edge. */
const PRINT_TABLE =
  'print:text-xs print:[&_th]:h-auto print:[&_th]:py-1.5 print:[&_th]:whitespace-normal print:[&_th]:px-2 print:[&_td]:px-2 print:[&_td]:py-1.5';

const SECTION_NOUN: Record<string, string> = { stuck: 'application', overdue: 'scorecard' };

const EMPTY_SECTION: Record<string, string> = {
  stuck: 'Nobody is stuck right now.',
  overdue: 'Every scorecard is in.',
};

/** An extra table (stuck list, overdue scorecards) whose rows can be selected and reminded. */
function SectionCard({
  reportKey,
  section,
  onOpen,
}: {
  reportKey: string;
  section: ReportSection;
  onOpen: (title: string, drill?: Drill | null) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const rows = rowsOf(section.rows, section.rowDrill);
  const picked = rows.filter((row) => selected.includes(row.id)).map((row) => row.drill!);
  const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
  const remind = useMutation({
    mutationFn: async () => {
      if (section.action === 'remind-stuck') {
        const result = await api.post<{ applications: number; recruiters: number }>(
          '/api/reports/stuck/remind',
          {
            applicationIds: picked.map((d) => d.applicationId),
          },
        );
        return `Reminded ${plural(result.recruiters, 'recruiter')} about ${plural(result.applications, 'application')}`;
      }
      const result = await api.post<{ sent: number }>('/api/reports/scorecards/remind', {
        items: picked.map((d) => ({ interviewId: d.interviewId, interviewer: d.interviewer })),
      });
      return result.sent === 0
        ? 'Nothing to send: those scorecards are already in'
        : `Sent ${plural(result.sent, 'reminder')}`;
    },
    onSuccess: (message) => {
      toast.success(message);
      setSelected([]);
    },
    onError: (error: Error) => toast.error('Could not send the reminders', error.message),
  });
  return (
    <Card className={cn('px-4 break-inside-avoid', PRINT_TABLE)}>
      <CardHeader title={section.title} description={section.description} className="px-1" />
      <DataTable
        exportable={false}
        data={rows}
        columns={columnsOf(section.columns, section.rows)}
        getRowId={(row) => row.id}
        viewKey={`report-${reportKey}-${section.key}`}
        noun={SECTION_NOUN[section.key] ?? section.columns[0]?.toLowerCase()}
        pageSize={Math.max(25, rows.length)}
        selectable={!!section.action}
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={
          <Button size="sm" onClick={() => remind.mutate()} loading={remind.isPending}>
            {section.action === 'remind-stuck' ? 'Remind recruiters' : 'Send reminders'}
          </Button>
        }
        onRowOpen={(row) => onOpen(String(row.cells[0] ?? ''), row.drill)}
        rowLabel={(row) =>
          `Open the application for ${row.cells[section.action === 'remind-scorecards' ? 1 : 0]}`
        }
        empty={
          <p className="py-8 text-center text-sm text-fg-subtle">
            {EMPTY_SECTION[section.key] ?? 'Nothing here right now.'}
          </p>
        }
        className="print:[&>div:first-child]:hidden"
      />
    </Card>
  );
}
