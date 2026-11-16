import type { Metadata } from 'next';
import { PublicFrame } from '@/features/careers/PublicFrame';
import { brandMetadata, getOrganization } from '@/features/careers/server';

// The booking page is the employer's, like the careers site, and is never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const { company, icons } = await brandMetadata();
  return {
    title: { default: `Choose an interview time · ${company}`, template: `%s · ${company}` },
    robots: { index: false, follow: false },
    icons,
  };
}

export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const { name, brand } = await getOrganization();
  return (
    <PublicFrame company={name} brand={brand}>
      {children}
    </PublicFrame>
  );
}
