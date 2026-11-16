'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  ChevronDown,
  CircleCheck,
  CopyPlus,
  Eye,
  Kanban,
  Pencil,
  Plus,
} from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Button,
  Card,
  CellStack,
  EmptyState,
  FilterSelect,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  PageHeader,
  RowActions,
  SearchInput,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SavedViews, type SavedView } from '@/components/data-table/SavedViews';
import { PipelineBar } from '@/components/pipeline/PipelineBar';
import { StatusBadge, statusLabel } from '@/components/status';
import { asJob, useAbility } from '@/lib/ability';
import { formatDate, formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { personName, statusOptions } from './requisition-data';
import { JOB_STATUS_TARGETS, daysOpen, planStatusChange } from './job-status';
import { useJobStatusChange } from './JobStatusChange';
import { JobDrafts } from './JobDrafts';
import type { JobListItem } from './requirements-types';

type JobFilters = {
  search: string;
  statuses: string[] | null;
  mine: boolean;
  department: string | null;
  location: string | null;
};
const NONE: JobFilters = {
  search: '',
  statuses: null,
  mine: false,
  department: null,
  location: null,
};
const VIEWS: SavedView<JobFilters>[] = [
  { id: 'all', name: 'All jobs', state: NONE, builtIn: true },
  { id: 'open', name: 'Open', state: { ...NONE, statuses: ['Open'] }, builtIn: true },
  {
    id: 'drafts',
    name: 'Drafts and approval',
    state: { ...NONE, statuses: ['Draft', 'PendingApproval'] },
    builtIn: true,
  },
  { id: 'hold', name: 'On hold', state: { ...NONE, statuses: ['OnHold'] }, builtIn: true },
  {
    id: 'closed',
    name: 'Closed',
    state: { ...NONE, statuses: ['Filled', 'Closed', 'Cancelled'] },
    builtIn: true,
  },
  { id: 'mine', name: 'My jobs', state: { ...NONE, mine: true }, builtIn: true },
];

const uniq = (values: string[]) => [...new Set(values)].sort();
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Every job with its pipeline at a glance. Views by status carry their counts. */
export function RequisitionsPage({ initialData }: { initialData: JobListItem[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const ability = useAbility();
  const canCreate = ability.can('create', 'Job');
  const managesJob = (job: JobListItem) => ability.can('update', asJob(job));
  const [filters, setFilters] = useState<JobFilters>(NONE);
  const [viewId, setViewId] = useState<string | null>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const status = useJobStatusChange(() => setSelected([]));
  const q = useDebouncedValue(filters.search.trim());
  const mine = (job: JobListItem) =>
    job.ownerEmail === user.email || job.recruiterEmail === user.email;

  // Any manual change leaves the saved view it started from.
  const setFilter = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setViewId(null);
  };

  const all = useQuery({
    queryKey: ['requisitions', ''],
    queryFn: () => api.get<JobListItem[]>('/api/requisitions?search='),
    initialData,
  });
  const searched = useQuery({
    queryKey: ['requisitions', q],
    queryFn: () => api.get<JobListItem[]>(`/api/requisitions?search=${encodeURIComponent(q)}`),
    enabled: !!q,
  });
  const base = all.data ?? [];
  const found = q ? searched.data : base;

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/api/requisitions/${id}/duplicate`),
    onSuccess: ({ id }) => {
      toast.success('Job duplicated', 'The copy is a draft. Change what you need, then open it.');
      router.push(`/jobs/${id}/settings`);
    },
    onError: (error: Error) => toast.error('Could not duplicate the job', error.message),
  });

  const rows = (found ?? []).filter(
    (job) =>
      (!filters.statuses || filters.statuses.includes(job.status)) &&
      (!filters.mine || mine(job)) &&
      (!filters.department || job.department === filters.department) &&
      (!filters.location || job.location === filters.location),
  );

  // Each built-in view shows how many jobs it holds.
  const views = VIEWS.map((view) => ({
    ...view,
    count: base.filter(
      (job) =>
        (!view.state.statuses || view.state.statuses.includes(job.status)) &&
        (!view.state.mine || mine(job)),
    ).length,
  }));

  const asStatusJob = (job: JobListItem) => ({
    id: job.id,
    title: job.title,
    activeApplications: job.activeApplications,
  });
  const changeSelected = (target: string) => {
    const known = new Map([...base, ...(found ?? [])].map((job) => [job.id, job]));
    const jobs = selected.flatMap((id) => known.get(id) ?? []);
    const { change, skipped } = planStatusChange(jobs, target, managesJob);
    status.request(change.map(asStatusJob), target, skipped.length);
  };

  const pipelineLink = (job: JobListItem, children: React.ReactNode, className?: string) => (
    <Link
      href={`/jobs/${job.id}/pipeline`}
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {children}
    </Link>
  );

  const columns: Column<JobListItem>[] = [
    {
      id: 'title',
      header: 'Job',
      hideable: false,
      className: 'max-w-72',
      cell: (job) => (
        <CellStack primary={job.title} secondary={`${job.department} · ${job.code}`} />
      ),
      sortValue: (job) => job.title,
    },
    {
      id: 'pipeline',
      header: 'Candidates',
      className: 'w-56',
      cell: (job) =>
        pipelineLink(
          job,
          <>
            <span className="w-6 shrink-0 text-right font-semibold text-fg tnum group-hover/link:text-accent-foreground">
              {job.activeApplications}
            </span>
            <PipelineBar stages={job.stages ?? []} className="flex-1" />
          </>,
          'group/link flex items-center gap-3 rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        ),
      sortValue: (job) => job.activeApplications,
      csv: (job) => job.activeApplications,
    },
    {
      id: 'new',
      header: 'New',
      align: 'right',
      className: 'tnum',
      cell: (job) =>
        job.newApplications ? (
          <span className="font-semibold text-fg">{job.newApplications}</span>
        ) : (
          <span className="text-fg-subtle">0</span>
        ),
      sortValue: (job) => job.newApplications ?? 0,
    },
    {
      id: 'days',
      header: 'Days open',
      align: 'right',
      className: 'tnum whitespace-nowrap',
      cell: (job) => daysOpen(job) ?? <span className="text-fg-subtle">Not opened</span>,
      sortValue: (job) => daysOpen(job) ?? -1,
      csv: (job) => daysOpen(job),
    },
    {
      id: 'location',
      header: 'Location',
      defaultHidden: true,
      cell: (job) => <CellStack primary={job.location} secondary={job.workMode} />,
      sortValue: (job) => job.location,
      csv: (job) => `${job.location} (${job.workMode})`,
    },
    {
      id: 'type',
      header: 'Employment type',
      defaultHidden: true,
      cell: (job) => job.employmentType,
      sortValue: (job) => job.employmentType,
    },
    {
      id: 'openings',
      header: 'Openings',
      align: 'right',
      defaultHidden: true,
      className: 'tnum',
      cell: (job) => job.openings,
      sortValue: (job) => job.openings,
    },
    {
      id: 'owner',
      header: 'Hiring manager',
      className: 'whitespace-nowrap',
      cell: (job) => {
        const name = personName(job.hiringManager, job.ownerEmail);
        return (
          <span
            className="flex items-center gap-2"
            title={job.hiringManager?.email ?? job.ownerEmail}
          >
            <Avatar name={name} size="xs" />
            {name}
          </span>
        );
      },
      sortValue: (job) => personName(job.hiringManager, job.ownerEmail),
      csv: (job) => personName(job.hiringManager, job.ownerEmail),
    },
    {
      id: 'recruiter',
      header: 'Recruiter',
      defaultHidden: true,
      className: 'whitespace-nowrap',
      cell: (job) => (
        <span title={job.recruiter?.email ?? job.recruiterEmail}>
          {personName(job.recruiter, job.recruiterEmail)}
        </span>
      ),
      sortValue: (job) => personName(job.recruiter, job.recruiterEmail),
      csv: (job) => personName(job.recruiter, job.recruiterEmail),
    },
    {
      id: 'start',
      header: 'Target start',
      defaultHidden: true,
      className: 'whitespace-nowrap',
      cell: (job) => formatDate(job.targetStartDate),
      sortValue: (job) => job.targetStartDate,
    },
    {
      id: 'updated',
      header: 'Updated',
      defaultHidden: true,
      className: 'whitespace-nowrap text-fg-muted',
      cell: (job) => <span title={formatDate(job.updatedAt)}>{formatRelative(job.updatedAt)}</span>,
      sortValue: (job) => job.updatedAt,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (job) => <StatusBadge status={job.status} />,
      sortValue: (job) => statusLabel(job.status),
      csv: (job) => statusLabel(job.status),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      align: 'right',
      cell: (job) => rowActions(job),
    },
  ];

  const rowActions = (job: JobListItem) => {
    return (
      // Menu clicks bubble through the portal to the row; keep them from opening the job.
      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <RowActions label={`Actions for ${job.title}`}>
          <MenuItem icon={<Eye />} onSelect={() => router.push(`/jobs/${job.id}`)}>
            Open job
          </MenuItem>
          <MenuItem icon={<Kanban />} onSelect={() => router.push(`/jobs/${job.id}/pipeline`)}>
            View pipeline
          </MenuItem>
          {managesJob(job) && (
            <>
              <MenuItem icon={<Pencil />} onSelect={() => router.push(`/jobs/${job.id}/posting`)}>
                Edit posting
              </MenuItem>
              <MenuItem icon={<CopyPlus />} onSelect={() => duplicate.mutate(job.id)}>
                Duplicate job
              </MenuItem>
              <MenuSeparator />
              <MenuSub>
                <MenuSubTrigger icon={<CircleCheck />}>Change status</MenuSubTrigger>
                <MenuSubContent>
                  {statusOptions(job).map((target) => (
                    <MenuItem
                      key={target}
                      onSelect={() => status.request([asStatusJob(job)], target)}
                    >
                      {statusLabel(target)}
                    </MenuItem>
                  ))}
                </MenuSubContent>
              </MenuSub>
            </>
          )}
        </RowActions>
      </span>
    );
  };

  const toolbar = (
    <>
      <SearchInput
        value={filters.search}
        onValueChange={(value) => setFilter('search', value)}
        placeholder="Search by job title or ID"
        className="w-full sm:w-64"
      />
      <FilterSelect
        allLabel="All teams"
        value={filters.department}
        onChange={(value) => setFilter('department', value)}
        data={uniq(base.map((job) => job.department))}
      />
      <FilterSelect
        allLabel="All locations"
        value={filters.location}
        onChange={(value) => setFilter('location', value)}
        data={uniq(base.map((job) => job.location))}
      />
    </>
  );

  const empty = (
    <EmptyState
      icon={Briefcase}
      title={base.length === 0 ? 'No jobs yet' : 'No jobs match'}
      description={
        base.length === 0
          ? 'Create a job to start collecting applications.'
          : 'Try another view, search or filter.'
      }
      action={
        base.length === 0 && canCreate ? (
          <Button asChild>
            <Link href="/jobs/new">Create job</Link>
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setFilters(NONE);
              setViewId('all');
            }}
          >
            Show all jobs
          </Button>
        )
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/jobs/new">
                <Plus />
                Create job
              </Link>
            </Button>
          )
        }
      />

      {canCreate && <JobDrafts />}
      <Card className="px-4 pt-4 pb-4">
        <SavedViews
          storageKey="jobs"
          builtIn={views}
          current={filters}
          activeId={viewId}
          onApply={(saved) => {
            setFilters(saved.state);
            setViewId(saved.id);
          }}
        />
        <DataTable
          // Filters reset paging without remounting, so the search box keeps focus.
          resetPageKey={JSON.stringify({ ...filters, search: q })}
          viewKey="jobs-v2"
          exportName="jobs"
          noun="job"
          toolbar={toolbar}
          data={rows}
          columns={columns}
          getRowId={(job) => job.id}
          loading={!found}
          empty={empty}
          pageSize={25}
          onRowOpen={(job) => router.push(`/jobs/${job.id}`)}
          rowLabel={(job) => `Open ${job.title}`}
          card={(job) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <CellStack primary={job.title} secondary={`${job.department} · ${job.code}`} />
                <StatusBadge status={job.status} size="sm" />
              </div>
              <PipelineBar stages={job.stages ?? []} />
              <p className="text-xs text-fg-subtle">
                {plural(job.activeApplications, 'candidate')}
                {job.newApplications ? ` · ${job.newApplications} new` : ''}
                {daysOpen(job) !== null && ` · open ${plural(daysOpen(job)!, 'day')}`}
              </p>
            </div>
          )}
          selectable={ability.can('update', 'Job')}
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={
            <Menu>
              <MenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  rightIcon={<ChevronDown />}
                  loading={status.isPending}
                >
                  Change status
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Move selected jobs to</MenuLabel>
                {JOB_STATUS_TARGETS.map((target) => (
                  <MenuItem key={target} onSelect={() => changeSelected(target)}>
                    {statusLabel(target)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          }
        />
      </Card>
      {status.dialog}
    </>
  );
}
