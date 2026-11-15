'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui';
import { BarChart, DonutChart, FunnelBars, LineChart, ScatterChart } from '@/components/ui/chart';
import { percentColumn, type ReportChart } from './report-data';

// "light" marks a part that doesn't count, for example a withdrawn offer.
const toneColor = (tone?: string | null) =>
  tone === 'light' ? 'var(--chart-6)' : tone ? `var(--tone-${tone}-dot)` : undefined;

/**
 * One report chart in a card. Columns[0] labels each row; the other columns are the series.
 * `onSelect` gets the row index when someone clicks a bar, point, slice or funnel row.
 */
export function ReportChartView({
  chart,
  onSelect,
  action,
  emptyText = 'Nothing to show for these filters yet.',
}: {
  chart: ReportChart;
  onSelect?: (index: number) => void;
  action?: ReactNode;
  emptyText?: string;
}) {
  const [label, ...values] = chart.columns;
  // A donut has one series, so its tones are one per slice.
  const named = chart.rows.map((row, index) => ({
    name: String(row[0] ?? '—'),
    value: Number(row[1] ?? 0),
    color: chart.kind === 'donut' ? toneColor(chart.tones?.[index]) : undefined,
  }));
  const items = chart.rows.map((row) => ({
    [label]: String(row[0] ?? '—'),
    ...Object.fromEntries(
      values.map((name, index) => [name, row[index + 1] == null ? null : Number(row[index + 1])]),
    ),
  }));
  const series = values.map((key, index) => {
    const column = percentColumn(key);
    return {
      key,
      label: column.header,
      unit: column.percent ? '%' : undefined,
      color: toneColor(chart.tones?.[index]),
      dashed: !!chart.compare && index === values.length - 1,
    };
  });
  const clickable = onSelect && chart.drill?.length ? onSelect : undefined;
  const empty =
    chart.rows.length === 0 || chart.rows.every((row) => row.slice(1).every((cell) => !cell));

  let body;
  if (empty) {
    body = <p className="py-10 text-center text-sm text-fg-subtle">{emptyText}</p>;
  } else if (chart.kind === 'donut') {
    body = (
      <DonutChart
        data={named}
        centerValue={named.reduce((sum, item) => sum + item.value, 0)}
        centerLabel={values[0]?.toLowerCase()}
        onSelect={clickable}
      />
    );
  } else if (chart.kind === 'funnel') {
    body = <FunnelBars data={named} onSelect={clickable} />;
  } else if (chart.kind === 'scatter') {
    body = (
      <ScatterChart
        data={chart.rows.map((row) => ({ x: Number(row[0] ?? 0), y: Number(row[1] ?? 0) }))}
        xLabel={label}
        yLabel={values[0]}
        xDomain={[0, 100]}
        onSelect={clickable}
      />
    );
  } else if (chart.kind === 'line') {
    body = <LineChart data={items} dataKey={label} series={series} onSelect={clickable} />;
  } else {
    // Long labels (jobs, stages, people, reasons) read better as horizontal bars.
    body = (
      <BarChart
        data={items}
        dataKey={label}
        series={series}
        stacked={chart.kind === 'stacked'}
        horizontal={named.some((item) => item.name.length > 9) || named.length > 8}
        onSelect={clickable}
      />
    );
  }

  return (
    <Card
      role="figure"
      aria-label={`${chart.title}. The numbers are also in the table below.`}
      className="flex min-w-0 flex-col break-inside-avoid print:overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-lg font-semibold text-fg">{chart.title}</h2>
          {action && <div className="shrink-0 pt-0.5 print:hidden">{action}</div>}
        </div>
        {chart.caption && <p className="mt-0.5 text-sm text-fg-subtle">{chart.caption}</p>}
      </div>
      <div className="px-5 pb-5">{body}</div>
    </Card>
  );
}
