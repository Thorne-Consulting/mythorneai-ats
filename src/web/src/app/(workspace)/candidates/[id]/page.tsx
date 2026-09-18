import { notFound } from 'next/navigation';
import { CandidateDetailPage } from '@/features/candidates/CandidateDetailPage';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { CandidateDetail } from '@/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const candidate = await serverApiGet<CandidateDetail>(`/api/candidates/${id}`);
    return <CandidateDetailPage id={id} initialData={candidate} />;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    throw error;
  }
}
