import { JobOverview } from '@/features/requisitions/JobOverview';
import { serverApiGet } from '@/lib/server-api';
import type { BoardData } from '@/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = await serverApiGet<BoardData>(`/api/requisitions/${id}/board`);
  return <JobOverview id={id} initialBoard={board} />;
}
