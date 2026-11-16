import type { Metadata } from 'next';
import { PortalProfile } from '@/features/candidate-portal/PortalProfile';

export const metadata: Metadata = { title: 'Your details' };

export default function Page() {
  return <PortalProfile />;
}
