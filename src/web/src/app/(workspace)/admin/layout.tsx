'use client';

import { AdminShell } from '../../../features/AdminPage';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
