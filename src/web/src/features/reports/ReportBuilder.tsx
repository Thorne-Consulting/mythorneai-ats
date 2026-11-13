'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import { SavedViews, type SavedView } from '@/components/data-table/SavedViews';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Select,
  SkeletonRows,
} from '@/components/ui';
import { BarChart, DonutChart, LineChart } from '@/components/ui/chart';
import {
  ALL_REPORTS,
  NO_FILTERS,
  aggregate,
  columnKinds,
  type Aggregate,
  type Filters,
} from './report-data';
import { ReportFilters, cellText, useReport } from './ReportView';

type ChartKind = 'bar' | 'line' | 'donut';
type BuilderState = {
  report: string;
  /** Column names, so a saved report survives the API reordering columns. */
  dimension: string;
  metric: string; // '' counts rows
  how: Aggregate;
  chart: ChartKind;
  filters: Filters;
};

const preset = (
  id: string,
  name: string,
  state: Omit<BuilderState, 'filters'>,
): SavedView<BuilderState> => ({
  id,
  name,
  builtIn: true,
  state: { ...state, filters: NO_FILTERS },
});

const PRESETS = [
  preset('hires-dept', 'Hires by department', {
    report: 'hires',
    dimension: 'Department',
    metric: '',
    how: 'count',
    chart: 'donut',
  }),
  preset('source-hire-rate', 'Hire rate by source', {
    report: 'sources',
    dimension: 'Source',
    metric: 'Hire rate (%)',
    how: 'avg',
    chart: 'bar',
  }),
  preset('overdue', 'Overdue scorecards by interviewer', {
    report: 'interviewers',
    dimension: 'Interviewer',
    metric: 'Overdue',
    how: 'sum',
    chart: 'bar',
  }),
  preset('hires-month', 'Hires per month', {
    report: 'hires',
    dimension: 'Hired on',
    metric: '',
    how: 'count',
    chart: 'line',
  }),
];

const ROWS = '__rows';

const howLabels: Record<Aggregate, string> = {
  count: 'Count',
  sum: 'Total',
  avg: 'Average',
  max: 'Highest',
};

/** /reports/builder: chart any measure from an existing report, grouped by any of its columns. */
export function ReportBuilder() {
  const [state, setState] = useState<BuilderState>(PRESETS[0].state);
  const [activeId, setActiveId] = useState<string | null>(PRESETS[0].id);
  const report = useReport(state.report, state.filters);
  const set = (next: Partial<BuilderState>) => {
    setState((current) => ({ ...current, ...next }));
    setActiveId(null);
  };

  const columns = report.data?.columns ?? [];
  const rows = report.data?.rows ?? [];
  const { dimensions, metrics } = columnKinds(rows, columns.length);
  // A saved choice may not exist in this report; fall back to the first sensible column.
  const dimension = dimensions.find((index) => columns[index] === state.dimension) ?? dimensions[0];
  const metric = metrics.find((index) => columns[index] === state.metric) ?? null;
  const how: Aggregate = metric === null ? 'count' : state.how === 'count' ? 'sum' : state.how;
  const groups = dimension === undefined ? [] : aggregate(rows, dimension, metric, how);
  const dimLabel = dimension === undefined ? 'Group' : columns[dimension];
  const valueLabel =
    metric === null ? 'Rows' : `${howLabels[how]} ${columns[metric].toLowerCase()}`;
  const chartRows = groups.map((group) => ({ [dimLabel]: group.name, [valueLabel]: group.value }));

  let chart;
  if (state.chart === 'donut')
    chart = (
      <DonutChart
        data={groups.filter((group) => group.value > 0)}
        centerValue={metric === null ? rows.length : undefined}
        centerLabel={metric === null ? 'Rows' : undefined}
      />
    );
  else if (state.chart === 'line')
    chart = <LineChart data={chartRows} dataKey={dimLabel} series={[{ key: valueLabel }]} />;
  else
    chart = (
      <BarChart
        data={chartRows}
        dataKey={dimLabel}
        series={[{ key: valueLabel }]}
        horizontal={groups.some((group) => group.name.length > 12)}
      />
    );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Report builder' }]}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Report builder <Badge tone="amber">Preview</Badge>
          </span>
        }
        description="Pick a report, what to measure and how to split it. Custom reports are saved in this browser."
      >
        <SavedViews<BuilderState>
          storageKey="report-builder"
          builtIn={PRESETS}
          current={state}
          activeId={activeId}
          onApply={(view) => {
            setState(view.state);
            setActiveId(view.id);
          }}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Select
              label="Data from"
              value={state.report}
              onChange={(value) => value && set({ report: value })}
              data={ALL_REPORTS.map((item) => ({ value: item.key, label: item.title }))}
            />
            <Select
              label="Split by"
              value={dimension === undefined ? null : columns[dimension]}
              onChange={(value) => value && set({ dimension: value })}
              data={dimensions.map((index) => columns[index])}
              disabled={dimensions.length === 0}
            />
            <Select
              label="Measure"
              // Radix Select cannot hold an empty value, so "count rows" has its own token.
              value={metric === null ? ROWS : columns[metric]}
              onChange={(value) => set({ metric: !value || value === ROWS ? '' : value })}
              data={[
                { value: ROWS, label: 'Number of rows' },
                ...metrics.map((index) => columns[index]),
              ]}
            />
            <Select
              label="Combine with"
              value={how}
              onChange={(value) => value && set({ how: value as Aggregate })}
              disabled={metric === null}
              data={(['sum', 'avg', 'max'] as const).map((value) => ({
                value,
                label: howLabels[value],
              }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SegmentedControl
              aria-label="Chart type"
              value={state.chart}
              onValueChange={(value) => set({ chart: value as ChartKind })}
              items={[
                { value: 'bar', label: 'Bar' },
                { value: 'line', label: 'Line' },
                { value: 'donut', label: 'Donut' },
              ]}
            />
            <ReportFilters
              filters={state.filters}
              onChange={(next) => set({ filters: { ...state.filters, ...next } })}
            />
          </div>
        </Card>

        {report.isLoading ? (
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        ) : report.error ? (
          <Alert tone="danger" title="This data didn’t load">
            {report.error.message}
          </Alert>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="Nothing to chart yet"
              description="This report has no rows for these filters. Try another report or clear the filters."
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card
              role="figure"
              aria-label={`${valueLabel} by ${dimLabel}. The figures are also in the table.`}
              className="min-w-0"
            >
              <CardHeader
                title={`${valueLabel} by ${dimLabel.toLowerCase()}`}
                description={report.data?.title}
              />
              <div className="px-5 pb-5">{chart}</div>
            </Card>
            <Card className="min-w-0 px-4">
              <DataTable
                data={groups}
                getRowId={(group) => group.name}
                viewKey="report-builder"
                exportName="custom-report"
                columns={[
                  {
                    id: 'name',
                    header: dimLabel,
                    cell: (group) => group.name,
                    sortValue: (group) => group.name,
                    className: 'font-medium',
                    hideable: false,
                  },
                  {
                    id: 'value',
                    header: valueLabel,
                    cell: (group) => cellText(group.value),
                    sortValue: (group) => group.value,
                    align: 'right',
                    className: 'tnum',
                    hideable: false,
                  },
                ]}
              />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
