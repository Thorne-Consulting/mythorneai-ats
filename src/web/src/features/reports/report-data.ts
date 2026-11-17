// Pure report helpers: filters in the URL, drill-downs, saved views and number formatting.
// No '@/…' imports so `report-data.check.mjs` can run it with plain node.

export type Cell = string | number | null;
export type Drill = Record<string, string>;

/** Everything a report URL can carry. Empty strings mean "not set". */
export interface Filters {
  requisitionId: string;
  department: string;
  source: string;
  recruiter: string;
  range: string;
  from: string;
  to: string;
  groupBy: string;
}
export const FILTER_KEYS: (keyof Filters)[] = [
  'requisitionId',
  'department',
  'source',
  'recruiter',
  'range',
  'from',
  'to',
  'groupBy',
];
export const NO_FILTERS: Filters = {
  requisitionId: '',
  department: '',
  source: '',
  recruiter: '',
  range: '',
  from: '',
  to: '',
  groupBy: '',
};

export interface ReportInfo {
  key: string;
  title: string;
  group: string;
  description: string;
  /** What the date filter applies to: applied, hired or interview. */
  dateField: string;
  breakdowns: string[];
}
export interface ReportStat {
  label: string;
  value: string;
  hint?: string | null;
  number?: number | null;
  drill?: Drill | null;
  lowerIsBetter?: boolean;
}
/** Every form the report charts can take; `ChartBuilder` offers the ones that fit plain rows. */
export type ChartKind =
  | 'bar'
  | 'stacked'
  | 'line'
  | 'area'
  | 'donut'
  | 'pie'
  | 'funnel'
  | 'scatter'
  | 'radar'
  | 'radial'
  | 'treemap'
  | 'sankey'
  | 'sunburst';

export interface ReportChart {
  kind: ChartKind;
  title: string;
  columns: string[];
  rows: Cell[][];
  caption?: string | null;
  drill?: (Drill | null)[] | null;
  tones?: string[] | null;
  compare?: boolean;
  report?: string | null;
}
export interface ReportSection {
  key: string;
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  rowDrill: (Drill | null)[];
  action?: 'remind-stuck' | 'remind-scorecards' | null;
}
export interface ReportTable {
  key: string;
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  note?: string | null;
  stats?: ReportStat[] | null;
  charts?: ReportChart[] | null;
  rowDrill?: (Drill | null)[] | null;
  sections?: ReportSection[] | null;
  hiddenColumns?: string[] | null;
  groupBy?: string | null;
  organization?: string | null;
  period?: string | null;
}

/** Report groups in the order the nav shows them. */
export const GROUP_ORDER = ['Pipeline', 'Speed', 'Sources', 'Team', 'People'];

/**
 * Report names for places that can't wait for the API catalog (the command search).
 * The Reports nav reads the catalog from the API; keep these titles in step with ReportEngine.Catalog.
 */
export const REPORT_GROUPS: { label: string; reports: { key: string; title: string }[] }[] = [
  {
    label: 'Pipeline',
    reports: [
      { key: 'funnel', title: 'Hiring funnel' },
      { key: 'velocity', title: 'Pipeline velocity' },
      { key: 'rejections', title: 'Rejection reasons' },
    ],
  },
  { label: 'Speed', reports: [{ key: 'time-to-hire', title: 'Time to hire and fill' }] },
  {
    label: 'Sources',
    reports: [
      { key: 'sources', title: 'Source quality' },
      { key: 'ai-outcomes', title: 'AI fit versus outcome' },
    ],
  },
  {
    label: 'Team',
    reports: [
      { key: 'interviewers', title: 'Interviewer load and feedback' },
      { key: 'offers', title: 'Offer acceptance' },
    ],
  },
  { label: 'People', reports: [{ key: 'hires', title: 'Hires' }] },
];

export const BREAKDOWN_LABELS: Record<string, string> = {
  job: 'Job',
  department: 'Department',
  source: 'Source',
  recruiter: 'Recruiter',
  month: 'Month',
  stage: 'Stage reached',
};

export const RANGES = [
  { value: '30d', label: 'the last 30 days' },
  { value: '90d', label: 'the last 90 days' },
  { value: 'quarter', label: 'this quarter' },
  { value: 'year', label: 'this year' },
  { value: 'custom', label: 'between dates' },
];

const VERBS: Record<string, string> = {
  applied: 'Applied',
  hired: 'Hired',
  interview: 'Interviewed',
  offer: 'Offer sent',
};

/** "Applied in the last 30 days", "Hired this quarter", "Interviewed at any time". */
export function rangeOptionLabel(dateField: string, range: string) {
  const verb = VERBS[dateField] ?? 'Applied';
  const option = RANGES.find((r) => r.value === range);
  if (!option) return `${verb} at any time`;
  return `${verb} ${option.value.endsWith('d') ? 'in ' : ''}${option.label}`;
}

export function filtersFrom(search: { get(name: string): string | null }): Filters {
  const filters = { ...NO_FILTERS };
  for (const key of FILTER_KEYS) filters[key] = search.get(key) ?? '';
  return filters;
}

/** Query string for the report API and report URLs; empty values are left out. */
export function queryString(values: Partial<Filters> & Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) if (value) params.set(name, value);
  return params.toString();
}

/**
 * The filters for a drill-down: the report's filters with the drill keys on top. A drill that sets
 * dates replaces the whole date filter. The breakdown never applies to a list of applications.
 */
export function withDrill(filters: Filters, drill: Drill): Record<string, string> {
  const base: Record<string, string> = { ...filters, groupBy: '' };
  if ('range' in drill || 'from' in drill || 'to' in drill) {
    base.range = '';
    base.from = '';
    base.to = '';
  }
  const merged = { ...base, ...drill };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value));
}

/** "Reached interview (%)" is a percent column: shown as "Reached interview" with "%" on each cell. */
export function percentColumn(name: string) {
  return name.endsWith(' (%)')
    ? { header: name.slice(0, -4), percent: true }
    : { header: name, percent: false };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
export const isIsoDate = (cell: Cell) => typeof cell === 'string' && ISO_DATE.test(cell);

export function formatNumber(value: number, percent = false) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('en-US')}${percent ? '%' : ''}`;
}

/**
 * Change against the previous period, worded for a person, and whether it is good news. A rate
 * (`percent`) changes in points: 50% to 60% is "+10 points", not "+20%".
 */
export function delta(
  value: number | null | undefined,
  previous: number | null | undefined,
  lowerIsBetter = false,
  percent = false,
): { direction: 'up' | 'down' | 'flat'; text: string; good: boolean } | null {
  if (value == null || previous == null) return null;
  const change = value - previous;
  if (Math.abs(change) < 0.05) return { direction: 'flat', text: 'No change', good: true };
  const direction = change > 0 ? 'up' : 'down';
  const sign = change > 0 ? '+' : '−';
  // From zero a percentage means nothing, so say how many more.
  const text = percent
    ? `${sign}${formatNumber(Math.abs(change))} ${Math.abs(change) === 1 ? 'point' : 'points'}`
    : previous === 0
      ? `${sign}${formatNumber(Math.abs(change))}`
      : `${sign}${Math.round(Math.abs(change / previous) * 100)}%`;
  return { direction, text, good: lowerIsBetter ? change < 0 : change > 0 };
}

/** A saved view's parameters: the report and the filters that are set. */
export function viewParams(report: string, filters: Filters) {
  const params: Record<string, string> = { report };
  for (const key of FILTER_KEYS) if (filters[key]) params[key] = filters[key];
  return JSON.stringify(params);
}

export function parseView(paramsJson: string): { report: string; filters: Filters } | null {
  try {
    const { report, ...rest } = JSON.parse(paramsJson) as Record<string, string>;
    if (!report) return null;
    const filters = { ...NO_FILTERS };
    for (const key of FILTER_KEYS) filters[key] = rest[key] ?? '';
    return { report, filters };
  } catch {
    return null;
  }
}

/** Where a saved view opens: its report with the saved filters, and the view's id to mark it. */
export function savedViewHref(paramsJson: string, id?: string) {
  const view = parseView(paramsJson);
  if (!view) return '/reports';
  const qs = queryString({ ...view.filters, view: id });
  return `/reports/${view.report}${qs ? `?${qs}` : ''}`;
}

export function sameFilters(a: Filters, b: Filters) {
  return FILTER_KEYS.every((key) => a[key] === b[key]);
}

/** Ready-made views from the old report builder: a standard report, broken down one way. */
export const BUILT_IN_VIEWS: {
  id: string;
  name: string;
  report: string;
  filters: Partial<Filters>;
}[] = [
  {
    id: 'hires-department',
    name: 'Hires by department',
    report: 'hires',
    filters: { groupBy: 'department' },
  },
  { id: 'hires-month', name: 'Hires per month', report: 'hires', filters: { groupBy: 'month' } },
  {
    id: 'time-department',
    name: 'Time to hire by department',
    report: 'time-to-hire',
    filters: { groupBy: 'department' },
  },
  {
    id: 'funnel-source',
    name: 'Funnel by source',
    report: 'funnel',
    filters: { groupBy: 'source' },
  },
  {
    id: 'rejections-stage',
    name: 'Reasons by stage',
    report: 'rejections',
    filters: { groupBy: 'stage' },
  },
];
