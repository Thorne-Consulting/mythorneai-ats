import { TalentSearchPage } from '@/features/talent/TalentSearchPage';
import { serverApiGet } from '@/lib/server-api';
import type { TalentSearchPage as TalentSearchResponse } from '@/types';

export default async function Page() {
  const data = await serverApiGet<TalentSearchResponse>(
    '/api/talent/search?page=1&pageSize=25&sort=relevance&includeDnc=false&skillMode=any',
  );
  return <TalentSearchPage initialData={data} />;
}
