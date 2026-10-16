import { ProfileSearch } from '@/features/talent/ProfileSearch';
import { serverApiGet } from '@/lib/server-api';
import type { TalentSearchPage } from '@/types';

export default async function Page() {
  const people = await serverApiGet<TalentSearchPage>(
    '/api/talent/search?page=1&pageSize=25&sort=recent&includeDnc=false&skillMode=any',
  );
  return <ProfileSearch initialData={people} />;
}
