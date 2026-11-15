import { redirect } from 'next/navigation';
import { ScheduleInterview } from '@/features/interviews/ScheduleInterview';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

export const metadata = { title: 'Schedule interview' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ application?: string; kit?: string; interview?: string; date?: string }>;
}) {
  const [{ application, kit, interview, date }, user] = await Promise.all([
    searchParams,
    serverApiGet<User>('/api/auth/me'),
  ]);
  // Interviewers see their interviews; booking them is for the hiring team.
  if (!abilityFor(user.rules).can('schedule', 'Interview')) redirect('/interviews');
  return (
    <ScheduleInterview
      applicationId={application}
      kitId={kit}
      interviewId={interview}
      date={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
    />
  );
}
