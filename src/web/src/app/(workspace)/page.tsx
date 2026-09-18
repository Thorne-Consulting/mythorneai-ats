import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { serverApiGet } from '@/lib/server-api';
import type { DashboardData } from '@/types';

export default async function Page() {
  const data = await serverApiGet<DashboardData>('/api/dashboard');
  return <DashboardPage initialData={data} />;
}
