'use client';

import { BarChart, DonutChart, FunnelChart, LineChart, ScatterChart } from '@mantine/charts';

type Cell = string | number | null;

export interface ReportChart {
  kind: 'bar' | 'stacked' | 'line' | 'donut' | 'funnel' | 'scatter';
  title: string;
  columns: string[];
  rows: Cell[][];
  caption?: string | null;
}

const COLORS = [
  'indigo.6',
  'teal.6',
  'orange.6',
  'gray.5',
  'grape.6',
  'cyan.6',
  'yellow.6',
  'pink.6',
];
const color = (index: number) => COLORS[index % COLORS.length];

/** One report chart. Columns[0] labels each row; the other columns are the series. */
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
  const series = values.map((name, index) => ({ name, color: color(index) }));
  const empty =
    chart.rows.length === 0 || chart.rows.every((row) => row.slice(1).every((cell) => !cell));

  let body;
  if (empty) {
    body = <p className="reports-chart-empty">Nothing to show for these filters yet.</p>;
  } else if (chart.kind === 'donut' || chart.kind === 'funnel') {
    const cells = named.map((item, index) => ({ ...item, color: color(index) }));
    body = (
      <div className="reports-donut">
        {chart.kind === 'donut' ? (
          <DonutChart
            size={160}
            thickness={24}
            withTooltip
            tooltipDataSource="segment"
            data={cells}
          />
        ) : (
          <FunnelChart size={180} withTooltip data={cells} />
        )}
        <ul className="reports-legend">
          {cells.map((item) => (
            <li key={item.name}>
              <span
                className="reports-swatch"
                style={{ background: `var(--mantine-color-${item.color.replace('.', '-')})` }}
              />
              {item.name}
              <b>{item.value}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (chart.kind === 'scatter') {
    body = (
      <ScatterChart
        h={240}
        data={[
          {
            name: 'Applications',
            color: 'indigo.6',
            data: chart.rows.map((row) => ({ x: Number(row[0] ?? 0), y: Number(row[1] ?? 0) })),
          },
        ]}
        dataKey={{ x: 'x', y: 'y' }}
        labels={{ x: label, y: values[0] }}
        xAxisProps={{ domain: [0, 100] }}
        yAxisProps={{ allowDecimals: false }}
      />
    );
  } else if (chart.kind === 'line') {
    body = (
      <LineChart
        h={220}
        data={items}
        dataKey={label}
        series={series}
        curveType="monotone"
        withDots={items.length <= 16}
        gridAxis="y"
      />
    );
  } else {
    // Long labels (jobs, stages, people) read better as horizontal bars.
    const vertical = named.some((item) => item.name.length > 12);
    body = (
      <BarChart
        h={vertical ? Math.max(160, items.length * 34 + 40) : 220}
        data={items}
        dataKey={label}
        series={series}
        type={chart.kind === 'stacked' ? 'stacked' : 'default'}
        orientation={vertical ? 'vertical' : 'horizontal'}
        yAxisProps={vertical ? { width: 140 } : undefined}
        gridAxis={vertical ? 'x' : 'y'}
        withLegend={series.length > 1}
      />
    );
  }

  return (
    <figure
      className="reports-chart"
      aria-label={`${chart.title}. The figures are also in the table.`}
    >
      <figcaption>
        <span className="reports-chart-title">{chart.title}</span>
        {chart.caption && <span className="reports-chart-caption">{chart.caption}</span>}
      </figcaption>
      {body}
    </figure>
  );
}
