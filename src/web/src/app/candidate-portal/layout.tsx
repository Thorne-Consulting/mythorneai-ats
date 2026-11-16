import type { Metadata } from 'next';
import { PortalProvider } from '@/features/candidate-portal/PortalProvider';
import { brandMetadata, getOrganization } from '@/features/careers/server';

export async function generateMetadata(): Promise<Metadata> {
  const { company, ...icons } = await brandMetadata();
  return {
    title: { default: `${company} candidate portal`, template: `%s · ${company} candidate portal` },
    robots: { index: false, follow: false },
    ...icons,
  };
}

export default async function CandidatePortalLayout({ children }: { children: React.ReactNode }) {
  const { name, brand } = await getOrganization();
  return (
    <PortalProvider company={name} brand={brand}>
      {children}
    </PortalProvider>
  );
}
