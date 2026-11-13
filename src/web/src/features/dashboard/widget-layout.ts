// Dashboard widget order and visibility, per browser. Pure so widget-layout.check.mjs can run it.

export const WIDGETS = {
  stats: 'Headline numbers',
  setup: 'Finish setting up',
  waiting: 'Waiting on you',
  pipeline: 'Hiring pipeline',
  sources: 'Candidate sources',
  recent: 'Recent candidates',
  jobs: 'Open jobs',
  upcoming: 'Coming up',
} as const;
export type WidgetId = keyof typeof WIDGETS;
export type WidgetLayout = { order: WidgetId[]; hidden: WidgetId[] };

/** What each role sees first before customising. */
export function defaultLayout(role: string): WidgetLayout {
  if (role === 'HiringManager')
    return {
      order: ['stats', 'waiting', 'jobs', 'upcoming', 'pipeline', 'recent', 'sources', 'setup'],
      hidden: ['sources'],
    };
  if (role === 'Recruiter')
    return {
      order: ['stats', 'pipeline', 'sources', 'recent', 'waiting', 'jobs', 'upcoming', 'setup'],
      hidden: [],
    };
  return {
    order: ['stats', 'setup', 'pipeline', 'sources', 'recent', 'upcoming', 'jobs', 'waiting'],
    hidden: [],
  };
}

/** A stored layout with unknown ids dropped and widgets added since then appended. */
export function normalizeLayout(stored: WidgetLayout, role: string): WidgetLayout {
  const known = (id: string): id is WidgetId => id in WIDGETS;
  const order = stored.order.filter(known);
  for (const id of defaultLayout(role).order) if (!order.includes(id)) order.push(id);
  return { order: [...new Set(order)], hidden: stored.hidden.filter(known) };
}

/** Move one widget up (-1) or down (+1); no-op at the ends. */
export function moveWidget(order: WidgetId[], id: WidgetId, delta: -1 | 1): WidgetId[] {
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
