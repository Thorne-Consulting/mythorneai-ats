import { notFound } from 'next/navigation';
import { ApplicationShell } from '@/features/applications/ApplicationShell';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { ApplicationDetailResponse } from '@/types';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await serverApiGet<ApplicationDetailResponse>(`/api/applications/${id}`);
    return (
      <ApplicationShell id={id} initialData={data}>
        {children}
      </ApplicationShell>
    );
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) notFound();
    throw error;
  }
}
