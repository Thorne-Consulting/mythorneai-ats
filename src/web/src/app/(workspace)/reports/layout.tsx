import type { ReactNode } from 'react';
import { ReportsShell } from '@/features/reports/ReportsShell';

export default function Layout({ children }: { children: ReactNode }) {
  return <ReportsShell>{children}</ReportsShell>;
}
