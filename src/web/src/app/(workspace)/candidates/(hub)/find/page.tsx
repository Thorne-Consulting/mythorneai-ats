import { redirect } from 'next/navigation';
import { RankForJob } from '@/features/talent/RankForJob';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; highlight?: string }>;
}) {
  const [{ job, highlight }, user] = await Promise.all([
    searchParams,
    serverApiGet<User>('/api/auth/me'),
  ]);
  if (user.role !== 'Admin' && user.role !== 'Recruiter') redirect('/candidates/people');
  return <RankForJob initialJobId={job} highlightId={highlight} />;
}
