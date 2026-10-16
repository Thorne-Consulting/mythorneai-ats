import { TalentSearchPage } from '@/features/talent/TalentSearchPage';
import { serverApiGet } from '@/lib/server-api';
import type { TalentSearchPage as TalentSearchResponse } from '@/types';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; highlight?: string }>;
}) {
  const { job, highlight } = await searchParams;
  const data = await serverApiGet<TalentSearchResponse>(
    '/api/talent/search?page=1&pageSize=25&sort=relevance&includeDnc=false&skillMode=any',
  );
  return <TalentSearchPage initialData={data} initialJobId={job} highlightId={highlight} />;
}
