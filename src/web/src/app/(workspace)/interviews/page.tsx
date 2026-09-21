import { InterviewsPage } from '@/features/interviews/InterviewsPage';
import { serverApiGet } from '@/lib/server-api';
import type { DashboardData } from '@/types';

export default async function Page() {
  const data = await serverApiGet<DashboardData>('/api/dashboard');
  return <InterviewsPage initialData={data} />;
}
