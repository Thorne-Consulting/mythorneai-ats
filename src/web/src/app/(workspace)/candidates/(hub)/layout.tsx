import type { ReactNode } from 'react';
import { CandidatesHub } from '@/features/candidates/CandidatesHub';

export default function Layout({ children }: { children: ReactNode }) {
  return <CandidatesHub>{children}</CandidatesHub>;
}
