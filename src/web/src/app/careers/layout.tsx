import type { Metadata } from 'next';
import { PublicFrame } from '@/features/careers/PublicFrame';

export const metadata: Metadata = { title: 'Careers' };

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
