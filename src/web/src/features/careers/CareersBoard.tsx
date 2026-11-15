import Link from 'next/link';
import { Briefcase, ChevronRight, SearchX } from 'lucide-react';
import { Button, Card, EmptyState } from '@/components/ui';
import { CareersHero } from './CareersHero';
import { CareersFilters } from './CareersFilters';
import { jobPath, metaParts, postedText } from './jobs';
import type { PublicFacets, PublicJob, PublicJobPage } from './public-api';

export type Filters = {
  q: string;
  department: string[];
  location: string[];
  mode: string[];
  /** `?embed=1`: shown inside the employer's own site, so jobs open in a new tab. */
  embed?: boolean;
};

/** Jobs by department, departments in name order, jobs newest first. */
function byDepartment(jobs: PublicJob[]) {
  const map = new Map<string, PublicJob[]>();
  for (const job of jobs) {
    const key = job.department.trim() || 'Other jobs';
    map.set(key, [...(map.get(key) ?? []), job]);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * The public job board, rendered on the server: one line per job under department headings, so
 * dozens of jobs fit on a screen. The filters live in the address, so a filtered list can be shared.
 */
export function CareersBoard({
  jobs,
  facets,
  filters,
}: {
  jobs: PublicJobPage;
  facets: PublicFacets;
  filters: Filters;
}) {
  const filtered = !!(
    filters.q ||
    filters.department.length ||
    filters.location.length ||
    filters.mode.length
  );
  const groups = byDepartment(jobs.items);
  const now = new Date();

  return (
    <>
      {!filters.embed && <CareersHero />}
      <CareersFilters facets={facets} filters={filters} />
      <p className="mb-4 text-sm text-fg-muted tnum" aria-live="polite">
        {filtered
          ? `${jobs.total} of ${facets.total} ${facets.total === 1 ? 'job' : 'jobs'} match`
          : `${jobs.total} open ${jobs.total === 1 ? 'job' : 'jobs'}`}
      </p>

      {jobs.items.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={SearchX}
              title="No jobs match"
              description="Try other words, or clear the filters to see every open job."
              action={
                <Button asChild variant="secondary">
                  <Link href={filters.embed ? '/careers?embed=1' : '/careers'}>Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No open jobs right now"
              description="Check back soon. Already applied? Follow your application in the candidate portal."
              action={
                <Button asChild variant="secondary">
                  <Link href="/candidate-portal">Go to the candidate portal</Link>
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([name, items], i) => (
            <section key={name} aria-labelledby={`dept-${i}`}>
              <h2
                id={`dept-${i}`}
                className="sticky top-0 z-10 -mx-1 mb-2 bg-background px-1 py-2 text-md font-semibold text-fg"
              >
                {name}
              </h2>
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card shadow-card">
                {items.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={jobPath(job)}
                      target={filters.embed ? '_blank' : undefined}
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:px-5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-6">
                        <span className="min-w-0 text-md font-medium text-fg group-hover:text-accent-foreground md:flex-1">
                          {job.title}
                        </span>
                        <span className="text-sm text-fg-muted">
                          {metaParts(job).join(' · ')}
                          <span className="text-fg-subtle md:hidden">
                            {' · '}
                            {postedText(job.postedAt, now)?.replace('Posted ', '')}
                          </span>
                        </span>
                        <span className="hidden w-36 shrink-0 text-right text-sm text-fg-subtle md:block">
                          {postedText(job.postedAt, now)}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-fg-subtle group-hover:text-accent-foreground"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {jobs.total > jobs.items.length && (
            <p className="text-center text-sm text-fg-subtle">
              Showing the newest {jobs.items.length} jobs. Search or filter to find the others.
            </p>
          )}
        </div>
      )}
    </>
  );
}
