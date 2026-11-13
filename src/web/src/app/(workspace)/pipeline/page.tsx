import { PipelinePage } from '@/features/pipeline/PipelinePage';
import { serverApiGet } from '@/lib/server-api';
import type { RequisitionSummary } from '@/types';

export default async function Page({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const [{ job }, jobs] = await Promise.all([
    searchParams,
    serverApiGet<RequisitionSummary[]>('/api/requisitions?status=Open'),
  ]);
  return <PipelinePage jobs={jobs} initialJobId={job} />;
}
