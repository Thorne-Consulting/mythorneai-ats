import type { ReactNode } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { CandidatesHub } from '@/features/candidates/CandidatesHub';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <CandidatesHub>{children}</CandidatesHub>
    </NuqsAdapter>
  );
}
