import type { Metadata } from 'next';
import { PortalLink } from '@/features/candidate-portal/PortalLink';

export const metadata: Metadata = { title: 'Opening your application', referrer: 'no-referrer' };

export default function Page() {
  return <PortalLink />;
}
