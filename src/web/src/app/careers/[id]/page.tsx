import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { JobPage } from '@/features/careers/JobPage';
import { idFromParam, jobPath, jobPostingLd, ldJson, plainText } from '@/features/careers/jobs';
import {
  getCurrencies,
  getFacets,
  getJob,
  getJobs,
  getOrganization,
  siteOrigin,
} from '@/features/careers/server';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(param: string) {
  const id = idFromParam(param);
  return id ? getJob(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await load((await params).id);
  if (!job) return { title: 'Job not found', robots: { index: false } };
  const path = jobPath(job);
  const description =
    plainText(job.description) || `${job.title}, ${job.department}. ${job.location}.`;
  return {
    title: job.title,
    description,
    alternates: { canonical: path },
    openGraph: { title: job.title, description, url: path, type: 'website' },
    twitter: { card: 'summary_large_image', title: job.title, description },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const param = (await params).id;
  const job = await load(param);
  // A closed, confidential or missing job is a real 404, so search engines drop it.
  if (!job) notFound();
  const path = jobPath(job);
  if (decodeURIComponent(param) !== path.slice('/careers/'.length)) {
    // Old links by id move to the readable address, keeping ?src= and other tags.
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams))
      for (const v of Array.isArray(value) ? value : value ? [value] : []) query.append(key, v);
    permanentRedirect(query.size ? `${path}?${query}` : path);
  }
  const [organization, origin, sameTeam, facets, currencies] = await Promise.all([
    getOrganization(),
    siteOrigin(),
    getJobs({ department: [job.department] }, 4),
    getFacets(),
    getCurrencies(),
  ]);
  const company = organization.name?.trim() || 'Company';
  const ld = jobPostingLd(job, { company, url: `${origin}${path}`, origin });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <JobPage
        job={job}
        related={sameTeam.items.filter((j) => j.id !== job.id).slice(0, 3)}
        totalOpen={facets.total}
        currencies={currencies}
      />
    </>
  );
}
