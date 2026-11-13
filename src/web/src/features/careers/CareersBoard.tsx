'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, Briefcase, Clock, MapPin, SearchX } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterSelect,
  PageHeader,
  SearchInput,
  SkeletonRows,
} from '@/components/ui';
import { useDebouncedValue } from '@/lib/hooks';
import { humanize } from '@/lib/format';
import { publicFetch, useCompany, type PublicJob, type PublicJobPage } from './public-api';

const PAGE_SIZE = 50;
const distinct = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Location, work mode and type as quiet badges. Shared by the board and "other open roles". */
export function JobMeta({ job }: { job: PublicJob }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {job.location && (
        <Badge tone="gray" icon={<MapPin />}>
          {job.location}
        </Badge>
      )}
      {job.workMode && <Badge tone="gray">{humanize(job.workMode)}</Badge>}
      {job.employmentType && (
        <Badge tone="gray" icon={<Clock />}>
          {humanize(job.employmentType)}
        </Badge>
      )}
      {job.openings > 1 && <Badge tone="green">{job.openings} openings</Badge>}
    </div>
  );
}

/**
 * Public job board. Search goes to the API (it also searches descriptions); department, location
 * and work mode filter what is loaded, because the API has no work-mode filter and the option
 * lists come from the jobs themselves.
 */
export function CareersBoard() {
  const company = useCompany();
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), 300);
  const [department, setDepartment] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [workMode, setWorkMode] = useState<string | null>(null);

  const jobs = useInfiniteQuery({
    queryKey: ['public', 'jobs', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      publicFetch<PublicJobPage>(
        `/public/jobs?${new URLSearchParams({ query, offset: String(pageParam), limit: String(PAGE_SIZE) })}`,
        {},
        'We could not load open jobs.',
      ),
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });

  const all = useMemo(() => jobs.data?.pages.flatMap((p) => p.items) ?? [], [jobs.data]);
  const total = jobs.data?.pages[0]?.total ?? 0;
  const shown = all.filter(
    (j) =>
      (!department || j.department.trim() === department) &&
      (!location || j.location.trim() === location) &&
      (!workMode || j.workMode.trim() === workMode),
  );
  const groups = useMemo(() => {
    const map = new Map<string, PublicJob[]>();
    for (const job of shown) {
      const key = job.department.trim() || 'Other roles';
      map.set(key, [...(map.get(key) ?? []), job]);
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);
  const filtered = !!(query || department || location || workMode);
  const clear = () => {
    setSearch('');
    setDepartment(null);
    setLocation(null);
    setWorkMode(null);
  };

  return (
    <>
      <PageHeader
        title={company ? `Jobs at ${company}` : 'Open jobs'}
        description="Find a role that fits. Apply in a few steps, then follow your application in the candidate portal."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search jobs"
          className="sm:max-w-xs sm:flex-1"
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={department}
            onChange={setDepartment}
            data={distinct(all.map((j) => j.department))}
            allLabel="All departments"
          />
          <FilterSelect
            value={location}
            onChange={setLocation}
            data={distinct(all.map((j) => j.location))}
            allLabel="All locations"
          />
          <FilterSelect
            value={workMode}
            onChange={setWorkMode}
            data={distinct(all.map((j) => j.workMode)).map((v) => ({
              value: v,
              label: humanize(v),
            }))}
            allLabel="Any work mode"
          />
        </div>
        {jobs.data && (
          <p className="text-sm text-fg-subtle tnum sm:ml-auto" aria-live="polite">
            {shown.length} of {total} {total === 1 ? 'job' : 'jobs'}
          </p>
        )}
      </div>

      {jobs.isPending ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : jobs.isError ? (
        <Alert
          tone="danger"
          title="We could not load open jobs"
          action={
            <Button variant="secondary" size="sm" onClick={() => jobs.refetch()}>
              Try again
            </Button>
          }
        >
          {jobs.error.message}
        </Alert>
      ) : shown.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState
              icon={SearchX}
              title="No jobs match"
              description="Try a different search or clear the filters to see every open job."
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No open jobs right now"
              description="Check back soon. Already applied somewhere? You can follow your application in the candidate portal."
              action={
                <Button asChild variant="secondary">
                  <Link href="/candidate-portal">Go to the candidate portal</Link>
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([name, items], i) => (
            <section key={name} aria-labelledby={`dept-${i}`}>
              <h2
                id={`dept-${i}`}
                className="mb-3 flex items-center gap-2 text-lg font-semibold text-fg"
              >
                {name}
                <span className="text-sm font-normal text-fg-subtle tnum">{items.length}</span>
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/careers/${job.id}`}
                      className="group flex h-full items-start gap-3 rounded-xl border border-border-subtle bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-md font-semibold text-fg group-hover:text-accent-foreground">
                          {job.title}
                        </p>
                        <JobMeta job={job} />
                      </div>
                      <ArrowRight
                        className="mt-1 size-4 shrink-0 text-fg-subtle group-hover:text-accent-foreground"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {jobs.hasNextPage && (
            <Button
              variant="secondary"
              className="self-center"
              loading={jobs.isFetchingNextPage}
              onClick={() => jobs.fetchNextPage()}
            >
              Show more jobs
            </Button>
          )}
        </div>
      )}
    </>
  );
}
