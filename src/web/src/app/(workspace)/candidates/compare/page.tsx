import { CandidateCompare } from '@/features/candidates/CandidateCompare';
import { compareIds } from '@/features/candidates/compare';

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  return <CandidateCompare ids={compareIds(ids)} />;
}
