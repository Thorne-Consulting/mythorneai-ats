import { ApplicantsPage } from '@/features/applicants/ApplicantsPage';
import { serverApiGet } from '@/lib/server-api';
import type { ApplicantPage, RequisitionSummary } from '@/types';

export default async function Page() {
  const [applicants, sessions] = await Promise.all([
    serverApiGet<ApplicantPage>('/api/applications?page=1&pageSize=50&sort=newest&status=Active'),
    serverApiGet<RequisitionSummary[]>('/api/requisitions'),
  ]);
  return <ApplicantsPage initialApplicants={applicants} initialSessions={sessions} />;
}
