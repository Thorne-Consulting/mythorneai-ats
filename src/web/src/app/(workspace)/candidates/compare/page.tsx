import { CandidateCompare } from '@/features/candidates/CandidateCompare';
import { compareIds } from '@/features/candidates/compare';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; job?: string }>;
}) {
  const { ids, job } = await searchParams;
  return <CandidateCompare ids={compareIds(ids)} jobId={job ?? null} />;
}
