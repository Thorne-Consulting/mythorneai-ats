import { RequisitionsPage } from '@/features/requisitions/RequisitionsPage';
import type { JobListItem } from '@/features/requisitions/requirements-types';
import { serverApiGet } from '@/lib/server-api';

export default async function Page() {
  const requisitions = await serverApiGet<JobListItem[]>('/api/requisitions');
  return <RequisitionsPage initialData={requisitions} />;
}
