import type { ReactNode } from 'react';
import { MySettingsShell } from '@/features/admin/MySettings';

export default function Layout({ children }: { children: ReactNode }) {
  return <MySettingsShell>{children}</MySettingsShell>;
}
