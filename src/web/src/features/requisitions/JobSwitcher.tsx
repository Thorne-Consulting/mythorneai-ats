'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { api } from '@/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { statusLabel } from '@/components/status';
import { cn } from '@/lib/cn';
import type { RequisitionSummary } from '@/types';

/**
 * The job title in the breadcrumb. It opens a searchable list of jobs and goes to the same tab
 * on the job you pick, so you can walk through every job's pipeline without leaving it.
 */
export function JobSwitcher({
  current,
  tab,
}: {
  current: { id: string; title: string };
  /** The tab path after /jobs/{id}, for example "pipeline". Empty for Overview. */
  tab: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Same request and cache key as the jobs list, so this is usually already loaded.
  const jobs = useQuery({
    queryKey: ['requisitions', ''],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?search='),
    enabled: open,
  }).data;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs ?? [])
      .filter((job) => !q || `${job.title} ${job.code}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.status === 'Open') - Number(a.status === 'Open') ||
          a.title.localeCompare(b.title),
      );
  }, [jobs, query]);

  const go = (id: string) => {
    setOpen(false);
    setQuery('');
    if (id !== current.id) router.push(`/jobs/${id}${tab ? `/${tab}` : ''}`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setActive(0);
      }}
    >
      <PopoverTrigger
        className="-mx-1 inline-flex max-w-[60vw] items-center gap-1 rounded-sm px-1 hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:max-w-sm"
        aria-label={`Switch job. Current job: ${current.title}`}
      >
        <span className="truncate">{current.title}</span>
        <ChevronsUpDown className="size-3 shrink-0" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="job-switcher-list"
            aria-activedescendant={options[active] ? `job-option-${options[active].id}` : undefined}
            aria-label="Find a job"
            placeholder="Find a job"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && options[active]) {
                e.preventDefault();
                go(options[active].id);
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div id="job-switcher-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {!jobs ? (
            <p className="px-3 py-2 text-sm text-fg-subtle">Loading jobs…</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-subtle">No jobs match</p>
          ) : (
            options.map((job, i) => (
              <div
                key={job.id}
                id={`job-option-${job.id}`}
                role="option"
                aria-selected={job.id === current.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(job.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-fg-muted',
                  i === active && 'bg-accent text-fg',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-fg">{job.title}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {job.code}
                    {job.status !== 'Open' && ` · ${statusLabel(job.status)}`}
                  </span>
                </span>
                {job.id === current.id && (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden />
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
