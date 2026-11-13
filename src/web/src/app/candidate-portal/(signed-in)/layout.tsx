import { PortalShell } from '@/features/candidate-portal/PortalShell';

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
