import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { JobFacts, JobPostingView } from '@/components/careers/JobPostingView';
import { jobPath, metaParts, postedText } from './jobs';
import type { PublicJob } from './public-api';
import { typeLabel } from './questions';
import { ApplyBar, ApplyCard } from './ShareActions';
import { PayTerms } from './PayTerms';
import type { PublicCurrencies } from './server';
import { sourceQuery } from './source';

/**
 * A job as applicants see it, rendered on the server: the posting, what the form will ask, a few
 * more jobs from the same team, and an apply card that stays in view.
 */
export function JobPage({
  job,
  related,
  totalOpen,
  currencies,
  search = '',
}: {
  job: PublicJob;
  /** Other open jobs in the same department. */
  related: PublicJob[];
  totalOpen: number;
  currencies: PublicCurrencies;
  /** The page's query string, so the Apply link keeps ?src= and utm_* tags. */
  search?: string;
}) {
  const questions = job.questions ?? [];
  const applyHref = `${jobPath(job)}/apply${sourceQuery(search)}`;
  const posted = postedText(job.postedAt);

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/careers"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden /> All jobs
        </Link>
        {posted && <p className="text-sm text-fg-subtle lg:hidden">{posted}</p>}
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-10">
          <JobPostingView job={job} pay={job.salary?.text} factsInSidebar />
          {job.salary && <PayTerms salary={job.salary} currencies={currencies} />}
          {questions.length > 0 && (
            <section aria-labelledby="job-questions" className="max-w-[68ch] space-y-3">
              <h2 id="job-questions" className="text-lg font-semibold text-fg">
                What we will ask you
              </h2>
              <p className="text-base text-fg-muted">
                Along with your contact details and resume, the form asks:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-base text-fg">
                {questions.map((q) => (
                  <li key={q.id}>
                    {q.label}
                    <span className="text-fg-subtle">
                      {' '}
                      ({typeLabel(q.type).toLowerCase()}
                      {q.required ? ', required' : ''})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {related.length > 0 && (
            <section aria-labelledby="related-jobs" className="max-w-[68ch] space-y-3">
              <h2 id="related-jobs" className="text-lg font-semibold text-fg">
                More jobs in {job.department}
              </h2>
              <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-card">
                {related.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={jobPath(other)}
                      className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                    >
                      <span className="font-medium text-fg">{other.title}</span>
                      <span className="text-sm text-fg-muted">{metaParts(other)[0]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="space-y-4 lg:sticky lg:top-6">
            <Card>
              <CardBody className="space-y-5 pt-5">
                <JobFacts job={job} pay={job.salary?.text} />
                <div className="border-t border-border-subtle pt-5">
                  <ApplyCard title={job.title} applyHref={applyHref} posted={posted} />
                </div>
              </CardBody>
            </Card>
            <Link
              href="/careers"
              className="inline-flex items-center gap-1 px-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              All {totalOpen} open {totalOpen === 1 ? 'job' : 'jobs'}{' '}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
      <ApplyBar title={job.title} applyHref={applyHref} />
    </div>
  );
}
