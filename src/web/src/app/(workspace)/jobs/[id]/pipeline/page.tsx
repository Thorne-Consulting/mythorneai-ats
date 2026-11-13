import { RequisitionPipeline } from '@/features/requisitions/RequisitionPipeline';
import { serverApiGet } from '@/lib/server-api';
import type { BoardData } from '@/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = await serverApiGet<BoardData>(`/api/requisitions/${id}/board`);
  return <RequisitionPipeline id={id} initialData={board} />;
}
