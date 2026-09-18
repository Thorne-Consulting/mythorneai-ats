import { notFound } from 'next/navigation';
import { RequisitionShell } from '@/features/requisitions/RequisitionShell';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { BoardData, RequisitionDetail } from '@/types';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const [data, board] = await Promise.all([
      serverApiGet<RequisitionDetail>(`/api/requisitions/${id}`),
      serverApiGet<BoardData>(`/api/requisitions/${id}/board`),
    ]);
    return (
      <RequisitionShell id={id} initialData={data} initialBoard={board}>
        {children}
      </RequisitionShell>
    );
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    throw error;
  }
}
