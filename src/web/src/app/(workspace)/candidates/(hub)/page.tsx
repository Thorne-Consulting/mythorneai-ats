import { ApplicantsPage } from '@/features/applicants/ApplicantsPage';
import { serverApiGet } from '@/lib/server-api';
import type { ApplicantPage, RequisitionSummary, User } from '@/types';
import PeoplePage from './people/page';

export default async function Page() {
  const user = await serverApiGet<User>('/api/auth/me');
  // Interviewers only see the people they interview, not the inbox.
  if (user.role === 'Interviewer') return <PeoplePage />;
  const [applicants, jobs] = await Promise.all([
    serverApiGet<ApplicantPage>('/api/applications?page=1&pageSize=50&sort=newest&status=Active'),
    serverApiGet<RequisitionSummary[]>('/api/requisitions'),
  ]);
  return <ApplicantsPage embedded initialApplicants={applicants} initialSessions={jobs} />;
}
