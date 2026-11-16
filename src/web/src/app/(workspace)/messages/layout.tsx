import { redirect } from 'next/navigation';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

/** Messages are for people who work on jobs (not interviewers); a typed address goes home. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await serverApiGet<User>('/api/auth/me');
  if (!abilityFor(user.rules).can('read', 'Message')) redirect('/');
  return children;
}
