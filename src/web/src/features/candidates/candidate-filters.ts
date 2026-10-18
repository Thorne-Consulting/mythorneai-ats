/** The Candidates list filters, and the query string GET /api/candidates takes for them. */
export type Filters = {
  search: string;
  status: string | null;
  jobId: string | null;
  stageId: string | null;
  minRating: string | null;
  hasResume: string | null;
  skills: string[];
  skillMode: string;
  title: string;
  location: string;
  source: string | null;
  minYears: number | string;
  seniority: string | null;
  minDegree: string | null;
  company: string;
  school: string;
  includeDnc: boolean;
  sort: string;
};
export const BLANK: Filters = {
  search: '',
  status: null,
  jobId: null,
  stageId: null,
  minRating: null,
  hasResume: null,
  skills: [],
  skillMode: 'any',
  title: '',
  location: '',
  source: null,
  minYears: '',
  seniority: null,
  minDegree: null,
  company: '',
  school: '',
  includeDnc: false,
  sort: 'recent',
};

/** The query string GET /api/candidates takes for a set of filters. */
export function candidateParams(filters: Filters, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: '25', sort: filters.sort });
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.jobId) params.set('requisitionId', filters.jobId);
  if (filters.stageId) params.set('stageId', filters.stageId);
  if (filters.minRating) params.set('minRating', filters.minRating);
  if (filters.hasResume) params.set('hasResume', filters.hasResume);
  if (filters.skills.length) {
    params.set('skills', filters.skills.join(','));
    params.set('skillMode', filters.skillMode);
  }
  if (filters.title) params.set('title', filters.title);
  if (filters.location) params.set('location', filters.location);
  if (filters.source) params.set('source', filters.source);
  if (filters.minYears !== '') params.set('minYears', String(filters.minYears));
  if (filters.seniority) params.set('seniority', filters.seniority);
  if (filters.minDegree) params.set('minDegree', filters.minDegree);
  if (filters.company) params.set('company', filters.company);
  if (filters.school) params.set('school', filters.school);
  if (filters.includeDnc) params.set('includeDnc', 'true');
  return params;
}
export const DEFAULT_LIST_QUERY = candidateParams(BLANK, 1).toString();
