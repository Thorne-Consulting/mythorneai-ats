import { redirect } from 'next/navigation';
import { RequisitionSettingsTab } from '@/features/requisitions/RequisitionSettings';
import { abilityFor, asJob } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { RequisitionDetail, User } from '@/types';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, user] = await Promise.all([
    serverApiGet<RequisitionDetail>(`/api/requisitions/${id}`),
    serverApiGet<User>('/api/auth/me'),
  ]);
  // The tab is hidden from people who only see the job; a typed address lands on the overview.
  if (!abilityFor(user.rules).can('update', asJob(job))) redirect(`/jobs/${id}`);
  return <RequisitionSettingsTab id={id} />;
}
