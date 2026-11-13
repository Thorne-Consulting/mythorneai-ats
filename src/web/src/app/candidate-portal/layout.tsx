import type { Metadata } from 'next';
import { PortalProvider } from '@/features/candidate-portal/PortalProvider';

export const metadata: Metadata = { title: 'Candidate portal' };

export default function CandidatePortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalProvider>{children}</PortalProvider>;
}
