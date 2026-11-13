'use client';

import { Card, CardHeader } from '@/components/ui';
import { BarChart, DonutChart, FunnelBars, LineChart, ScatterChart } from '@/components/ui/chart';

type Cell = string | number | null;

export interface ReportChart {
  kind: 'bar' | 'stacked' | 'line' | 'donut' | 'funnel' | 'scatter';
  title: string;
  columns: string[];
  rows: Cell[][];
  caption?: string | null;
}

/** One report chart in a card. Columns[0] labels each row; the other columns are the series. */
export function ReportChartView({ chart }: { chart: ReportChart }) {
  const [label, ...values] = chart.columns;
  const named = chart.rows.map((row) => ({
    name: String(row[0] ?? '—'),
    value: Number(row[1] ?? 0),
  }));
  const items = chart.rows.map((row) => ({
    [label]: String(row[0] ?? '—'),
    ...Object.fromEntries(values.map((name, index) => [name, Number(row[index + 1] ?? 0)])),
  }));
  const series = values.map((key) => ({ key }));
  const empty =
    chart.rows.length === 0 || chart.rows.every((row) => row.slice(1).every((cell) => !cell));

  let body;
  if (empty) {
    body = (
      <p className="py-8 text-center text-sm text-fg-subtle">
        Nothing to show for these filters yet.
      </p>
    );
  } else if (chart.kind === 'donut') {
    body = (
      <DonutChart data={named} centerValue={named.reduce((sum, item) => sum + item.value, 0)} />
    );
  } else if (chart.kind === 'funnel') {
    body = <FunnelBars data={named} />;
  } else if (chart.kind === 'scatter') {
    body = (
      <ScatterChart
        data={chart.rows.map((row) => ({ x: Number(row[0] ?? 0), y: Number(row[1] ?? 0) }))}
        xLabel={label}
        yLabel={values[0]}
        xDomain={[0, 100]}
      />
    );
  } else if (chart.kind === 'line') {
    body = <LineChart data={items} dataKey={label} series={series} />;
  } else {
    // Long labels (jobs, stages, people) read better as horizontal bars.
    body = (
      <BarChart
        data={items}
        dataKey={label}
        series={series}
        stacked={chart.kind === 'stacked'}
        horizontal={named.some((item) => item.name.length > 12)}
      />
    );
  }

  return (
    <Card
      role="figure"
      aria-label={`${chart.title}. The numbers are also in the table below.`}
      className="min-w-0 break-inside-avoid"
    >
      <CardHeader title={chart.title} description={chart.caption ?? undefined} />
      <div className="px-5 pb-5">{body}</div>
    </Card>
  );
}
