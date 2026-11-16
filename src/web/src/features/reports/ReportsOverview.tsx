'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bookmark, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Card,
  CardLink,
  FilterSelect,
  Input,
  PageHeader,
  SkeletonRows,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { DrillDrawer, type DrillRequest } from './DrillDrawer';
import { KpiGrid, KpiTile } from './KpiTile';
import { ReportChartView } from './ReportChartView';
import { delta, parseView, queryString, savedViewHref, withDrill, NO_FILTERS } from './report-data';
import { useOverview, useReportCatalog, useReportViews } from './queries';

const PERIODS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Between dates' },
];

const EMPTY: Record<string, string> = {
  funnel: 'Nobody applied in this period.',
  hires: 'Nobody was hired in this period.',
  sources: 'Nobody applied in this period.',
  interviewers: 'No scorecards are overdue.',
};

/** /reports: four numbers against the previous period, pinned views, and a small chart per area. */
export function ReportsOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const range = search.get('range') || '30d';
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const period = { range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '' };
  const overview = useOverview(period);
  const catalog = useReportCatalog();
  const views = useReportViews();
  const pinned = (views.data ?? []).filter((view) => view.pinned);
  const [drill, setDrill] = useState<DrillRequest | null>(null);

  const go = (next: Record<string, string>) => {
    const qs = queryString({ ...period, ...next });
    router.replace(qs === 'range=30d' ? pathname : `${pathname}?${qs}`, { scroll: false });
  };
  // Reports open on the same dates as the overview.
  const reportHref = (key: string) =>
    `/reports/${key}?${queryString(range === 'all' ? {} : period)}`;
  const title = (key: string) =>
    catalog.data?.find((report) => report.key === key)?.title ?? 'report';
  const data = overview.data;

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          overview.data?.comparison
            ? `Changes compare with the ${overview.data.comparison}.`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {range === 'custom' && (
              <span className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="From"
                  title="From"
                  className="w-[150px]"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => go({ from: event.currentTarget.value })}
                />
                <span className="text-sm text-fg-subtle">to</span>
                <Input
                  type="date"
                  aria-label="To"
                  title="To"
                  className="w-[150px]"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => go({ to: event.currentTarget.value })}
                />
              </span>
            )}
            <FilterSelect
              aria-label="Dates"
              allLabel="All time"
              value={range === 'all' ? null : range}
              data={PERIODS}
              onChange={(value) => go({ range: value ?? 'all', from: '', to: '' })}
            />
          </div>
        }
      />
      {overview.error ? (
        <Alert tone="danger" title="The overview didn’t load">
          {overview.error.message} Try again in a moment.
        </Alert>
      ) : !data ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-6 transition-opacity',
            overview.isPlaceholderData && 'opacity-60',
          )}
        >
          <KpiGrid count={data.kpis.length}>
            {data.kpis.map((kpi) => (
              <KpiTile
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                hint={kpi.hint}
                delta={delta(kpi.number, kpi.previous, kpi.lowerIsBetter, kpi.percent)}
                versus={kpi.previousValue ? `from ${kpi.previousValue}` : null}
                href={reportHref(kpi.report)}
                openLabel={`${kpi.label}: ${kpi.value}. Open the ${title(kpi.report)} report`}
              />
            ))}
          </KpiGrid>

          {pinned.length > 0 && (
            <section aria-labelledby="pinned-views">
              <h2 id="pinned-views" className="mb-2 text-md font-semibold text-fg">
                Pinned views
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pinned.map((view) => (
                  <li key={view.id}>
                    <Link
                      href={savedViewHref(view.paramsJson, view.id)}
                      className="flex h-full items-start gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 shadow-card transition-colors hover:border-border hover:bg-muted"
                    >
                      {view.shared ? (
                        <Users className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                      ) : (
                        <Bookmark className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block font-medium break-words text-fg">{view.name}</span>
                        <span className="block text-xs text-fg-subtle">
                          {title(parseView(view.paramsJson)?.report ?? '')}
                          {view.mine ? '' : ` · Shared by ${view.owner}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.charts.map((chart) => (
              <ReportChartView
                key={chart.title}
                chart={chart}
                emptyText={EMPTY[chart.report ?? ''] ?? 'Nothing to show for these dates.'}
                action={
                  chart.report ? (
                    <CardLink href={reportHref(chart.report)}>Open report</CardLink>
                  ) : undefined
                }
                onSelect={(index) => {
                  const target = chart.drill?.[index];
                  if (!target || !chart.report) return;
                  setDrill({
                    title: `${chart.title}: ${chart.rows[index]?.[0] ?? ''}`,
                    params: {
                      ...withDrill({ ...NO_FILTERS, ...period }, target),
                      report: chart.report,
                    },
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
      <DrillDrawer request={drill} onClose={() => setDrill(null)} />
    </>
  );
}
