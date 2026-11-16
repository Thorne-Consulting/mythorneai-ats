import { notFound } from 'next/navigation';
import { CandidateShell } from '@/features/candidates/CandidateShell';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { CandidateDetail } from '@/types';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const candidate = await serverApiGet<CandidateDetail>(`/api/candidates/${id}`);
    return (
      <CandidateShell id={id} initialData={candidate}>
        {children}
      </CandidateShell>
    );
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    throw error;
  }
}
