import { notFound } from 'next/navigation';
import { serverApiGet } from '@/lib/server-api';
import type { CandidateListPage } from '@/types';
import { BLANK, candidateParams, viewState, type Filters } from './candidate-filters';
import { CandidatesList, type ListStart } from './CandidatesList';

/** Server side of a list segment: fetch the first page the client will ask for, then hand over. */
async function render(filters: Filters, rest: Omit<ListStart, 'initialData' | 'initialFilters'>) {
  const people = await serverApiGet<CandidateListPage>(
    `/api/candidates?${candidateParams(filters, 1)}`,
  );
  return <CandidatesList initialData={people} initialFilters={filters} {...rest} />;
}

/** /candidates and the status segments. `?job=` (from a job or the pipeline) ranks for that job. */
export function statusPage(status: string | null) {
  return async function Page({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
    const { job } = await searchParams;
    return render({ ...BLANK, status, jobId: job ?? null }, { rank: Boolean(job) });
  };
}

/** /candidates/views/[viewId]: one of the user's saved views. */
export async function savedViewPage(viewId: string) {
  const views = await serverApiGet<{ id: string; name: string; paramsJson: string }[]>(
    '/api/saved-views?area=talent',
  );
  const view = views.find((item) => item.id === viewId);
  if (!view) notFound();
  const { filters, describe } = viewState(view.paramsJson);
  return render(filters, { initialDescribe: describe, view: { id: view.id, name: view.name } });
}
