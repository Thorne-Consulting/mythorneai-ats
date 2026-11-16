import { RequisitionPipeline } from '@/features/requisitions/RequisitionPipeline';
import { serverApiGet } from '@/lib/server-api';
import type { BoardData } from '@/types';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  const board = await serverApiGet<BoardData>(`/api/requisitions/${id}/board`);
  return (
    <RequisitionPipeline
      id={id}
      initialData={board}
      view={view === 'list' || view === 'board' ? view : undefined}
    />
  );
}
