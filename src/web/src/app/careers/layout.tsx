import type { Metadata } from 'next';
import { PublicFrame } from '@/features/careers/PublicFrame';
import { brandMetadata, getOrganization, siteOrigin } from '@/features/careers/server';

// Public pages carry the employer's name and icon, not ours: "Product designer · Acme careers".
export async function generateMetadata(): Promise<Metadata> {
  const { company, ...icons } = await brandMetadata();
  return {
    metadataBase: new URL(await siteOrigin()),
    title: { default: `${company} careers`, template: `%s · ${company} careers` },
    description: `Open jobs at ${company}. Read about each job and apply online.`,
    openGraph: { siteName: `${company} careers`, type: 'website' },
    ...icons,
  };
}

export default async function CareersLayout({ children }: { children: React.ReactNode }) {
  const { name, brand } = await getOrganization();
  return (
    <PublicFrame company={name} brand={brand}>
      {children}
    </PublicFrame>
  );
}
