import type { Metadata } from 'next';
import { CareersBoard } from '@/features/careers/CareersBoard';
import { getFacets, getJobs, getOrganization, list } from '@/features/careers/server';

// The layout's title template only reaches child pages, so this page names itself in full.
export async function generateMetadata(): Promise<Metadata> {
  const company = (await getOrganization()).name?.trim() || 'Company';
  return {
    title: { absolute: `Open jobs · ${company} careers` },
    alternates: { canonical: '/careers' },
  };
}

type Search = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const filters = {
    q: list(params.q)[0]?.slice(0, 100) ?? '',
    department: list(params.department),
    location: list(params.location),
    mode: list(params.mode),
    embed: params.embed === '1',
  };
  const [jobs, facets] = await Promise.all([getJobs(filters), getFacets()]);
  return <CareersBoard jobs={jobs} facets={facets} filters={filters} />;
}
