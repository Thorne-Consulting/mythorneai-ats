import { redirect } from 'next/navigation';
import { settingsHome } from '@/components/layout/nav';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

export default async function Page() {
  const user = await serverApiGet<User>('/api/auth/me');
  redirect(settingsHome(abilityFor(user.rules)));
}
