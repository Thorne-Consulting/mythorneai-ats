import { notFound } from 'next/navigation';
import { RequisitionShell } from '@/features/requisitions/RequisitionShell';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { RequisitionDetail } from '@/types';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await serverApiGet<RequisitionDetail>(`/api/requisitions/${id}`);
    return (
      <RequisitionShell id={id} initialData={data}>
        {children}
      </RequisitionShell>
    );
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    throw error;
  }
}
