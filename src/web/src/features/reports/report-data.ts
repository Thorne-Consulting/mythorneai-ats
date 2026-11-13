// Pure report helpers: the catalog grouping, URL filters and the builder's aggregation.
// No '@/…' imports so `report-data.check.mjs` can run it with plain node.

export type Cell = string | number | null;

export interface Filters {
  requisitionId: string;
  source: string;
  from: string;
  to: string;
}
export const NO_FILTERS: Filters = { requisitionId: '', source: '', from: '', to: '' };

export interface ReportMeta {
  key: string;
  title: string;
  blurb: string;
}

/**
 * How the API's report keys are grouped in the Reports sidebar. Titles match the API catalog;
 * a key the API adds later lands in "Other" until it is placed here.
 */
export const REPORT_GROUPS: { label: string; reports: ReportMeta[] }[] = [
  {
    label: 'Pipeline',
    reports: [
      {
        key: 'funnel',
        title: 'Hiring funnel',
        blurb: 'How many applications reach each stage and move on to the next.',
      },
      {
        key: 'hires',
        title: 'Hires',
        blurb: 'Everyone you hired, with the details payroll and HR need.',
      },
    ],
  },
  {
    label: 'Speed',
    reports: [
      {
        key: 'time-to-hire',
        title: 'Time to hire and fill',
        blurb: 'Days from application to hire, and from opening a job to filling it.',
      },
      {
        key: 'time-in-stage',
        title: 'Time in each stage',
        blurb: 'Where applications wait longest before moving on.',
      },
    ],
  },
  {
    label: 'Sources',
    reports: [
      {
        key: 'sources',
        title: 'Source effectiveness',
        blurb: 'Where applications come from and which sources lead to hires.',
      },
      {
        key: 'ai-outcomes',
        title: 'AI fit versus outcome',
        blurb: 'Whether candidates the AI scored higher actually got further.',
      },
    ],
  },
  {
    label: 'Team',
    reports: [
      {
        key: 'interviewers',
        title: 'Interviewer load and feedback',
        blurb: 'Who interviews the most, and how fast they send scorecards.',
      },
    ],
  },
];

export const ALL_REPORTS = REPORT_GROUPS.flatMap((group) => group.reports);
export const reportMeta = (key: string) => ALL_REPORTS.find((report) => report.key === key);

/** Query string for the report API and report URLs; empty values are left out. */
export function queryString(values: Partial<Filters> & Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) if (value) params.set(name, value);
  return params.toString();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
export const isIsoDate = (cell: Cell) => typeof cell === 'string' && ISO_DATE.test(cell);

/** A column is a metric when it holds numbers and nothing but numbers or blanks. */
export function columnKinds(rows: Cell[][], width: number) {
  const dimensions: number[] = [];
  const metrics: number[] = [];
  for (let column = 0; column < width; column++) {
    const cells = rows.map((row) => row[column]).filter((cell) => cell !== null && cell !== '');
    if (cells.length > 0 && cells.every((cell) => typeof cell === 'number')) metrics.push(column);
    else dimensions.push(column);
  }
  return { dimensions, metrics };
}

export type Aggregate = 'count' | 'sum' | 'avg' | 'max';

/**
 * Group rows by one column and reduce a metric column. Dates group by month. `metric` null (or
 * `count`) counts rows. Groups keep first-seen order, which keeps time series in order.
 */
export function aggregate(
  rows: Cell[][],
  dimension: number,
  metric: number | null,
  how: Aggregate,
): { name: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const raw = row[dimension];
    const name =
      raw === null || raw === ''
        ? 'Unknown'
        : isIsoDate(raw)
          ? String(raw).slice(0, 7)
          : String(raw);
    const value = metric === null ? 1 : row[metric];
    if (!groups.has(name)) groups.set(name, []);
    if (typeof value === 'number') groups.get(name)!.push(value);
  }
  return [...groups].map(([name, values]) => {
    let value: number;
    if (how === 'count' || metric === null) value = values.length;
    else if (how === 'sum') value = values.reduce((sum, v) => sum + v, 0);
    else if (how === 'max') value = values.length ? Math.max(...values) : 0;
    else value = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    return { name, value: Math.round(value * 10) / 10 };
  });
}
