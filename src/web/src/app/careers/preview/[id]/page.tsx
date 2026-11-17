import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { Alert } from '@/components/ui';
import { JobPage } from '@/features/careers/JobPage';
import { getCurrencies, getFacets, getJobs, getPostingPreview } from '@/features/careers/server';

export const metadata: Metadata = { title: 'Posting preview', robots: { index: false } };

/**
 * The job page as applicants will see it, for people who manage the job, even before it is open.
 * The workspace shows it in a frame on the job's "Job posting" tab.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const job = await getPostingPreview((await params).id);
  if (!job) notFound();
  const [sameTeam, facets, currencies] = await Promise.all([
    getJobs({ department: [job.department] }, 4),
    getFacets(),
    getCurrencies(),
  ]);
  return (
    <>
      {!job.listed && (
        <Alert tone="warning" icon={EyeOff} className="mb-6">
          Not public yet. Applicants can see this page once the job is open
          {job.status === 'Open' ? ' and no longer confidential' : ''}.
        </Alert>
      )}
      <JobPage
        job={job}
        related={sameTeam.items.filter((j) => j.id !== job.id).slice(0, 3)}
        totalOpen={facets.total}
        currencies={currencies}
      />
    </>
  );
}
