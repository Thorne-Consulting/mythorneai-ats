import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { AdminShell } from '@/features/admin/AdminShell';

export default async function Layout({ children }: { children: ReactNode }) {
  const menuCollapsed = (await cookies()).get('ats-settings-nav-collapsed')?.value === '1';
  return <AdminShell menuCollapsed={menuCollapsed}>{children}</AdminShell>;
}
