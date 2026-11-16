import type { SearchParams } from 'nuqs/server';
import { poolPage } from '@/features/candidates/list-route';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { poolId } = await params;
  return poolPage(poolId, searchParams);
}
