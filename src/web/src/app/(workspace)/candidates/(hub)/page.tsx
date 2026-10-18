import { DEFAULT_LIST_QUERY } from '@/features/candidates/candidate-filters';
import { CandidatesList } from '@/features/candidates/CandidatesList';
import { serverApiGet } from '@/lib/server-api';
import type { CandidateListPage } from '@/types';

export default async function Page({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const [{ job }, people] = await Promise.all([
    searchParams,
    serverApiGet<CandidateListPage>(`/api/candidates?${DEFAULT_LIST_QUERY}`),
  ]);
  return <CandidatesList initialData={people} initialJobId={job} />;
}
