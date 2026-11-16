import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  type inferParserType,
} from 'nuqs/server';

/**
 * The Candidates list filters as they live in the address bar (`/candidates?skills=react&seniority=Senior`),
 * so Back, refresh and a shared link keep them. The segment (status, "Not in a job") comes from the route.
 */
export const filterParsers = {
  search: parseAsString.withDefault(''),
  jobId: parseAsString,
  stageId: parseAsString,
  minRating: parseAsString,
  hasResume: parseAsString,
  skills: parseAsArrayOf(parseAsString).withDefault([]),
  skillMode: parseAsString.withDefault('any'),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  title: parseAsString.withDefault(''),
  location: parseAsString.withDefault(''),
  source: parseAsString,
  minYears: parseAsInteger,
  seniority: parseAsString,
  minDegree: parseAsString,
  company: parseAsString.withDefault(''),
  school: parseAsString.withDefault(''),
  includeDnc: parseAsBoolean.withDefault(false),
  /** Pick-one and pick-many custom fields as "key=value", for example "team=Sales". */
  custom: parseAsArrayOf(parseAsString, '|').withDefault([]),
  /** A stage type (Applied, Screen, Interview, Offer, Hired), across jobs. */
  stageType: parseAsString,
  /** Only applications on open jobs (the dashboard's counts). */
  openJobs: parseAsBoolean.withDefault(false),
  /** An application question of the chosen job, and the answers to match (any of them). */
  questionId: parseAsString,
  answers: parseAsArrayOf(parseAsString, '|').withDefault([]),
  /** Only applications with an answer flagged for review. */
  flagged: parseAsBoolean.withDefault(false),
  sort: parseAsString.withDefault('recent'),
};
/** Short names in the address bar. */
export const filterUrlKeys = {
  search: 'q',
  jobId: 'job',
  stageId: 'stage',
  minRating: 'rating',
  hasResume: 'resume',
  skillMode: 'skillMatch',
  minYears: 'years',
  minDegree: 'degree',
  includeDnc: 'dnc',
  custom: 'cf',
  questionId: 'question',
  answers: 'answer',
} as const;
/** The list's other address-bar state: page, and the job everyone is ranked against ("Find candidates"). */
export const listParsers = {
  page: parseAsInteger.withDefault(1),
  find: parseAsString,
  ask: parseAsString.withDefault(''),
};

export type UrlFilters = inferParserType<typeof filterParsers>;
export type Filters = UrlFilters & {
  /** From the route: a status segment. */
  status: string | null;
  /** From the route: "Not in a job" is false. */
  hasApplications: boolean | null;
  /** From the route: a talent pool. */
  poolId: string | null;
};

/** The filters that come from the route rather than the address bar. */
export type RouteFilters = Pick<Filters, 'status' | 'hasApplications' | 'poolId'>;
export const routeFilters = (f: Filters): RouteFilters => ({
  status: f.status,
  hasApplications: f.hasApplications,
  poolId: f.poolId,
});

export const BLANK: Filters = {
  search: '',
  status: null,
  hasApplications: null,
  poolId: null,
  jobId: null,
  stageId: null,
  minRating: null,
  hasResume: null,
  skills: [],
  skillMode: 'any',
  tags: [],
  title: '',
  location: '',
  source: null,
  minYears: null,
  seniority: null,
  minDegree: null,
  company: '',
  school: '',
  includeDnc: false,
  custom: [],
  stageType: null,
  openJobs: false,
  questionId: null,
  answers: [],
  flagged: false,
  sort: 'recent',
};

/** The query string GET /api/candidates (and export, and bulk "everyone matching") takes for a set of filters. */
export function candidateParams(filters: Filters, page = 1) {
  const params = new URLSearchParams({ page: String(page), pageSize: '25', sort: filters.sort });
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.hasApplications !== null)
    params.set('hasApplications', String(filters.hasApplications));
  if (filters.poolId) params.set('poolId', filters.poolId);
  if (filters.jobId) params.set('requisitionId', filters.jobId);
  if (filters.stageId) params.set('stageId', filters.stageId);
  if (filters.minRating) params.set('minRating', filters.minRating);
  if (filters.hasResume) params.set('hasResume', filters.hasResume);
  if (filters.skills.length) {
    params.set('skills', filters.skills.join(','));
    params.set('skillMode', filters.skillMode);
  }
  if (filters.tags.length) params.set('tags', filters.tags.join(','));
  if (filters.title) params.set('title', filters.title);
  if (filters.location) params.set('location', filters.location);
  if (filters.source) params.set('source', filters.source);
  if (filters.minYears !== null) params.set('minYears', String(filters.minYears));
  if (filters.seniority) params.set('seniority', filters.seniority);
  if (filters.minDegree) params.set('minDegree', filters.minDegree);
  if (filters.company) params.set('company', filters.company);
  if (filters.school) params.set('school', filters.school);
  if (filters.includeDnc) params.set('includeDnc', 'true');
  for (const pair of filters.custom) params.append('cf', pair);
  if (filters.stageType) params.set('stageType', filters.stageType);
  if (filters.openJobs) params.set('openJobs', 'true');
  if (filters.questionId) {
    params.set('questionId', filters.questionId);
    for (const answer of filters.answers) params.append('answer', answer);
  }
  if (filters.flagged) params.set('flagged', 'true');
  return params;
}

/** The segments in the Candidates sidebar: route slug → what it narrows to. */
export const STATUS_SEGMENTS = [
  { slug: 'active', status: 'Active', label: 'Active', count: 'active' },
  { slug: 'hired', status: 'Hired', label: 'Hired', count: 'hired' },
  { slug: 'rejected', status: 'Rejected', label: 'Rejected', count: 'rejected' },
  { slug: 'withdrawn', status: 'Withdrawn', label: 'Withdrawn', count: 'withdrawn' },
] as const;

/** GET /api/candidates/counts */
export type SegmentCounts = {
  all: number;
  active: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  noJob: number;
  /** People in each talent pool, by pool id. */
  pools: Record<string, number>;
  /** People in each saved view, by view id. */
  views: Record<string, number>;
};

/** The filter keys behind the Filters button, each shown as a removable chip when set. */
export const CHIP_KEYS = [
  'skills',
  'tags',
  'title',
  'location',
  'minYears',
  'seniority',
  'minDegree',
  'company',
  'school',
  'source',
  'minRating',
  'hasResume',
  'includeDnc',
  'stageType',
  'openJobs',
  'questionId',
  'flagged',
] as const;
export type ChipKey = (typeof CHIP_KEYS)[number] | `custom:${string}`;

/** The custom field filters grouped by field key: { team: ['Sales', 'Support'] }. */
export function customFilters(custom: string[]) {
  const groups: Record<string, string[]> = {};
  for (const pair of custom) {
    const at = pair.indexOf('=');
    if (at > 0) (groups[pair.slice(0, at)] ??= []).push(pair.slice(at + 1));
  }
  return groups;
}

const DEGREES: Record<string, string> = {
  HighSchool: 'High school or above',
  Associate: 'Associate or above',
  Bachelor: "Bachelor's or above",
  Master: "Master's or above",
  Doctorate: 'Doctorate',
};

/** What each stage type is called on the dashboard and in filters. */
export const STAGE_TYPE_LABELS: Record<string, string> = {
  Applied: 'New',
  Screen: 'Screening',
  Interview: 'Interview',
  Offer: 'Offer',
  Hired: 'Hired',
  Other: 'Other',
};

/** One chip per active filter: "Skills: react or typescript", "Seniority: Senior and up". */
export function filterChips(
  filters: Filters,
  fieldLabels: Record<string, string> = {},
  questionLabel?: string,
): { key: ChipKey; label: string }[] {
  const chips: { key: ChipKey; label: string }[] = [];
  const add = (key: ChipKey, label: string) => chips.push({ key, label });
  if (filters.skills.length)
    add('skills', `Skills: ${filters.skills.join(filters.skillMode === 'all' ? ' and ' : ' or ')}`);
  if (filters.tags.length) add('tags', `Tags: ${filters.tags.join(' or ')}`);
  if (filters.title) add('title', `Job title: ${filters.title}`);
  if (filters.location) add('location', `Location: ${filters.location}`);
  if (filters.minYears !== null)
    add(
      'minYears',
      `${filters.minYears} ${filters.minYears === 1 ? 'year' : 'years'} of experience or more`,
    );
  if (filters.seniority) add('seniority', `Seniority: ${filters.seniority} and up`);
  if (filters.minDegree)
    add('minDegree', `Degree: ${DEGREES[filters.minDegree] ?? filters.minDegree}`);
  if (filters.company) add('company', `Worked at ${filters.company}`);
  if (filters.school) add('school', `Studied at ${filters.school}`);
  if (filters.source) add('source', `Source: ${filters.source}`);
  if (filters.minRating) add('minRating', `Rated ${filters.minRating} or higher`);
  if (filters.hasResume)
    add('hasResume', filters.hasResume === 'true' ? 'Resume read' : 'No resume read yet');
  if (filters.includeDnc) add('includeDnc', 'Includes do not contact');
  // Without a job the toolbar shows the stage type; with one, its stages take that place.
  if (filters.stageType && filters.jobId)
    add('stageType', `Stage type: ${STAGE_TYPE_LABELS[filters.stageType] ?? filters.stageType}`);
  if (filters.openJobs) add('openJobs', 'Open jobs only');
  if (filters.questionId)
    add(
      'questionId',
      `${questionLabel ?? 'Answer'}${filters.answers.length ? `: ${filters.answers.join(' or ')}` : ''}`,
    );
  if (filters.flagged) add('flagged', 'Flagged answers only');
  for (const [key, values] of Object.entries(customFilters(filters.custom)))
    add(`custom:${key}`, `${fieldLabels[key] ?? key}: ${values.join(' or ')}`);
  return chips;
}

/** The blank value for one chip's filter, to remove it. */
export function clearChip(key: ChipKey, filters?: Filters): Partial<Filters> {
  if (key.startsWith('custom:')) {
    const field = key.slice('custom:'.length);
    return { custom: (filters?.custom ?? []).filter((pair) => !pair.startsWith(`${field}=`)) };
  }
  if (key === 'skills') return { skills: [], skillMode: 'any' };
  if (key === 'questionId') return { questionId: null, answers: [] };
  const plain = key as (typeof CHIP_KEYS)[number];
  return { [plain]: BLANK[plain] };
}

/** Do two filter sets ask for the same people? (The order of skills and tags does not matter.) */
export function sameFilters(a: Filters, b: Filters) {
  const norm = (f: Filters) =>
    JSON.stringify(
      Object.entries({
        ...f,
        skills: [...f.skills].sort(),
        tags: [...f.tags].sort(),
        custom: [...(f.custom ?? [])].sort(),
        answers: [...(f.answers ?? [])].sort(),
      }).sort(([x], [y]) => x.localeCompare(y)),
    );
  return norm(a) === norm(b);
}

/** Hidden columns and row size a view carries, so it opens looking the way it was saved. */
export type ViewLayout = {
  hidden: string[];
  density: 'comfortable' | 'compact';
  sort: { id: string; dir: 'asc' | 'desc' } | null;
};

/** GET /api/saved-views?area=talent */
export type SavedViewRow = {
  id: string;
  name: string;
  paramsJson: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  pinned: boolean;
};

/** What a candidate view stores: its filters, the list query (for counts), the Ask AI text and columns. */
export function viewParams(filters: Filters, describe: string, layout: ViewLayout | null) {
  const query = candidateParams(filters);
  for (const key of ['page', 'pageSize', 'sort']) query.delete(key);
  // `listQuery`, not `query`: older views used `query` for the Ask AI text.
  return JSON.stringify({ filters, describe, listQuery: query.toString(), layout });
}

/** A view's saved columns, if it has any. */
export function viewLayout(paramsJson: string): ViewLayout | null {
  try {
    const layout = JSON.parse(paramsJson)?.layout;
    return layout && Array.isArray(layout.hidden) ? layout : null;
  } catch {
    return null;
  }
}

/** A saved view's stored JSON as filters. Older views stored minYears as '' and { jobId, query, minYears, location }. */
export function viewState(paramsJson: string): { filters: Filters; describe: string } {
  let saved: {
    filters?: Partial<Record<keyof Filters, unknown>>;
    describe?: string;
    jobId?: string | null;
    query?: string;
    minYears?: number | string | null;
    location?: string;
  } = {};
  try {
    saved = JSON.parse(paramsJson);
  } catch {}
  const years = (value: unknown) =>
    value === '' || value === null || value === undefined || Number.isNaN(Number(value))
      ? null
      : Number(value);
  const filters: Filters = saved.filters
    ? {
        ...BLANK,
        ...(saved.filters as Partial<Filters>),
        tags: (saved.filters.tags as string[] | undefined) ?? [],
        custom: (saved.filters.custom as string[] | undefined) ?? [],
        answers: (saved.filters.answers as string[] | undefined) ?? [],
        minYears: years(saved.filters.minYears),
        hasApplications: null,
        poolId: null,
      }
    : {
        ...BLANK,
        jobId: saved.jobId ?? null,
        minYears: years(saved.minYears),
        location: saved.location ?? '',
      };
  return { filters, describe: saved.describe ?? saved.query ?? '' };
}
