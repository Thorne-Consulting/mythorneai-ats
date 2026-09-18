'use client';

import { AuthGate } from '../../auth';
import { AppFrame } from '../../components/AppFrame';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppFrame>{children}</AppFrame>
    </AuthGate>
  );
}
