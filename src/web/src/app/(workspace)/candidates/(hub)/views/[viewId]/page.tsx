import type { SearchParams } from 'nuqs/server';
import { savedViewPage } from '@/features/candidates/list-route';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ viewId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { viewId } = await params;
  return savedViewPage(viewId, searchParams);
}
