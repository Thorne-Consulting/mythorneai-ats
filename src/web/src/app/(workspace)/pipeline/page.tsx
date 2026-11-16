import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PipelinePage } from '@/features/pipeline/PipelinePage';
import { CLOSED_STATUSES } from '@/features/requisitions/job-status';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { RequisitionSummary, User } from '@/types';

/**
 * The sidebar's Pipeline goes to a job's Pipeline tab: the job in ?job=, else the last job you
 * viewed (still hiring), else the first open job. With none, a page that points to Jobs.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  if (job) redirect(`/jobs/${job}/pipeline`);
  const [jobs, user, cookieStore] = await Promise.all([
    serverApiGet<RequisitionSummary[]>('/api/requisitions'),
    serverApiGet<User>('/api/auth/me'),
    cookies(),
  ]);
  const last = cookieStore.get('ats-last-job')?.value;
  const target =
    jobs.find((j) => j.id === last && !CLOSED_STATUSES.includes(j.status)) ??
    jobs.find((j) => j.status === 'Open');
  if (target) redirect(`/jobs/${target.id}/pipeline`);
  return <PipelinePage canCreate={abilityFor(user.rules).can('create', 'Job')} />;
}
