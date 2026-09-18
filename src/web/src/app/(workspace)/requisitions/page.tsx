import { RequisitionsPage } from '@/features/requisitions/RequisitionsPage';
import { serverApiGet } from '@/lib/server-api';
import type { RequisitionSummary } from '@/types';

export default async function Page() {
  const requisitions = await serverApiGet<RequisitionSummary[]>('/api/requisitions');
  return <RequisitionsPage initialData={requisitions} />;
}
