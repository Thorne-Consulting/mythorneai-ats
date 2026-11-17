// A chart someone makes on demand from a report's own table: pick a form, a label column and the
// value columns. Pure, so custom-chart.check.mjs runs it with node.
import type { Cell, ChartKind, ReportChart } from './report-data';

export type ChartSpec = {
  kind: ChartKind;
  /** The column that names each row. */
  label: string;
  /** The numeric columns to draw, in order. */
  values: string[];
  /** Keep the top N rows by the first value, 0 for all. */
  top: number;
};

/** The forms that make sense from plain rows, with what each needs. */
export const CHART_FORMS: { kind: ChartKind; label: string; values: 'one' | 'many' | 'xy' }[] = [
  { kind: 'bar', label: 'Bars', values: 'many' },
  { kind: 'stacked', label: 'Stacked bars', values: 'many' },
  { kind: 'line', label: 'Lines', values: 'many' },
  { kind: 'area', label: 'Areas', values: 'many' },
  { kind: 'pie', label: 'Pie', values: 'one' },
  { kind: 'donut', label: 'Donut', values: 'one' },
  { kind: 'funnel', label: 'Funnel', values: 'one' },
  { kind: 'treemap', label: 'Treemap', values: 'one' },
  { kind: 'radial', label: 'Radial bars', values: 'one' },
  { kind: 'radar', label: 'Radar', values: 'many' },
  { kind: 'scatter', label: 'Scatter', values: 'xy' },
];

const isNumber = (cell: Cell) => typeof cell === 'number';

/** Columns where most filled cells are numbers: the ones a chart can draw. */
export function numericColumns(columns: string[], rows: Cell[][]) {
  return columns.filter((_, i) => {
    const filled = rows.map((row) => row[i]).filter((cell) => cell != null && cell !== '');
    return filled.length > 0 && filled.filter(isNumber).length >= filled.length / 2;
  });
}

/** Columns that are not numeric: the ones that can name a row. */
export function labelColumns(columns: string[], rows: Cell[][]) {
  const numeric = new Set(numericColumns(columns, rows));
  const labels = columns.filter((c) => !numeric.has(c));
  return labels.length > 0 ? labels : columns.slice(0, 1);
}

/** A sensible first spec for a table, or null when it has nothing to draw. */
export function defaultSpec(columns: string[], rows: Cell[][]): ChartSpec | null {
  const values = numericColumns(columns, rows);
  if (values.length === 0 || rows.length === 0) return null;
  const label = labelColumns(columns, rows)[0];
  return { kind: 'bar', label, values: [values[0]], top: 0 };
}

/**
 * The chart for a spec, in the same shape the server sends, so the report page draws it with
 * the same component. Rows with no value in the first chosen column are left out.
 */
export function buildChart(columns: string[], rows: Cell[][], spec: ChartSpec): ReportChart {
  const form = CHART_FORMS.find((f) => f.kind === spec.kind) ?? CHART_FORMS[0];
  const want = form.values === 'one' ? spec.values.slice(0, 1) : spec.values;
  const values = want.filter((v) => columns.includes(v));
  const li = columns.indexOf(spec.label);
  const vis = values.map((v) => columns.indexOf(v));
  let picked = rows
    .filter((row) => vis.length > 0 && row[vis[0]] != null && row[vis[0]] !== '')
    .map((row) => row);
  if (form.values === 'xy') {
    // Scatter: x is the first value column, y the second; the label names the point.
    const [xi, yi] = vis;
    picked = picked.filter((row) => yi != null && isNumber(row[xi]) && isNumber(row[yi]));
    return {
      kind: 'scatter',
      title: `${columns[yi] ?? ''} by ${columns[xi] ?? ''}`,
      columns: [columns[xi] ?? 'x', columns[yi] ?? 'y', spec.label],
      rows: picked.map((row) => [row[xi], row[yi], row[li]]),
    };
  }
  if (spec.top > 0)
    picked = [...picked]
      .sort((a, b) => Number(b[vis[0]] ?? 0) - Number(a[vis[0]] ?? 0))
      .slice(0, spec.top);
  return {
    kind: spec.kind,
    title: values.length === 1 ? `${values[0]} by ${spec.label}` : `By ${spec.label}`,
    columns: [spec.label, ...values],
    rows: picked.map((row) => [row[li] ?? '—', ...vis.map((i) => row[i])]),
  };
}
