import { CandidatesPage } from '@/features/candidates/CandidatesPage';
import { serverApiGet } from '@/lib/server-api';
import type { CandidateSummary } from '@/types';

export default async function Page() {
  const candidates = await serverApiGet<CandidateSummary[]>('/api/candidates');
  return <CandidatesPage initialData={candidates} />;
}
