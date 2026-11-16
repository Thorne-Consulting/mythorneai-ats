import { redirect } from 'next/navigation';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

/** Assessments are hidden from people without them (interviewers); a typed address goes home. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await serverApiGet<User>('/api/auth/me');
  if (!abilityFor(user.rules).can('read', 'Assessment')) redirect('/');
  return children;
}
