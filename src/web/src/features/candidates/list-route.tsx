import { redirect } from 'next/navigation';
import { createLoader, type SearchParams } from 'nuqs/server';
import { serverApiGet } from '@/lib/server-api';
import type { CandidateListPage } from '@/types';
import type { TalentPool } from './talent-pools';
import {
  BLANK,
  candidateParams,
  filterParsers,
  filterUrlKeys,
  listParsers,
  routeFilters,
  viewState,
  type Filters,
  type SavedViewRow,
} from './candidate-filters';
import { CandidatesList, type ListStart } from './CandidatesList';

const loadFilters = createLoader(filterParsers, { urlKeys: filterUrlKeys });
const loadList = createLoader(listParsers);
type Props = { searchParams: Promise<SearchParams> };

/** True when the address bar carries any list filter. */
function hasUrlFilters(params: SearchParams) {
  const keys = Object.keys(filterParsers).map(
    (key) => filterUrlKeys[key as keyof typeof filterUrlKeys] ?? key,
  );
  return keys.some((key) => params[key] !== undefined);
}

/** Server side of a list segment or view: fetch the first page the client will ask for, then hand over. */
async function render(
  base: Filters,
  params: SearchParams,
  rest: Omit<ListStart, 'initialData' | 'baseFilters'>,
) {
  const filters: Filters = hasUrlFilters(params)
    ? { ...loadFilters(params), ...routeFilters(base) }
    : base;
  const { page } = loadList(params);
  const people = await serverApiGet<CandidateListPage>(
    `/api/candidates?${candidateParams(filters, page)}`,
  );
  return <CandidatesList initialData={people} baseFilters={base} {...rest} />;
}

/** /candidates, the status segments and "Not in a job". */
export function statusPage(status: string | null, hasApplications: boolean | null = null) {
  return async function Page({ searchParams }: Props) {
    const params = await searchParams;
    return render({ ...BLANK, status, hasApplications }, params, {});
  };
}

/** /candidates/views/[viewId]: a saved view, yours or the team's. A deleted view goes back to the list. */
export async function savedViewPage(viewId: string, searchParams: Promise<SearchParams>) {
  const views = await serverApiGet<SavedViewRow[]>('/api/saved-views?area=talent');
  const view = views.find((item) => item.id === viewId);
  if (!view) redirect('/candidates?missingView=1');
  const { filters, describe } = viewState(view.paramsJson);
  return render(filters, await searchParams, { initialDescribe: describe, view });
}

/** /candidates/pools/[poolId]: everyone in a talent pool, in the same list. */
export async function poolPage(poolId: string, searchParams: Promise<SearchParams>) {
  const pools = await serverApiGet<TalentPool[]>('/api/talent-pools');
  const pool = pools.find((item) => item.id === poolId);
  if (!pool) redirect('/candidates/talent-pools?missingPool=1');
  return render({ ...BLANK, poolId, sort: 'added' }, await searchParams, { pool });
}
