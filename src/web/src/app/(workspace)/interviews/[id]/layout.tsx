import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { InterviewRecord } from '@/features/interviews/InterviewRecord';
import type { InterviewRecordData } from '@/features/interviews/interview-api';
import { ServerApiError, serverApiGet } from '@/lib/server-api';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await serverApiGet<InterviewRecordData>(`/api/interviews/${id}`);
    return (
      <InterviewRecord id={id} initialData={data}>
        {children}
      </InterviewRecord>
    );
  } catch (error) {
    if (error instanceof ServerApiError && (error.status === 404 || error.status === 400))
      notFound();
    throw error;
  }
}
