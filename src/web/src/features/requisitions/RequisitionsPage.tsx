'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  ChevronDown,
  CircleCheck,
  Eye,
  FilePen,
  Kanban,
  Pencil,
  Plus,
  Rows3,
  Users,
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
  SegmentedControl,
  SkeletonRows,
  StatCard,
  StatGrid,
  TableToolbar,
  toast,
} from '@/components/ui';
import { Board, BoardColumn } from '@/components/pipeline/BoardColumn';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SavedViews, type SavedView } from '@/components/data-table/SavedViews';
import { StatusBadge, statusTones } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative, humanize } from '@/lib/format';
import { useDebouncedValue, useLocalStorageState } from '@/lib/hooks';
import { rowLinkProps } from '@/lib/row-link-props';
import type { RequisitionSummary } from '@/types';
import { canManageJob, nameFromEmail, statusOptions } from './requisition-data';
import { JOB_STATUS_TARGETS, planStatusChange } from './job-status';

const STATUSES = ['Open', 'PendingApproval', 'Draft', 'OnHold', 'Filled', 'Closed', 'Cancelled'];
// These board columns show even when empty, so the board keeps its shape.
const ALWAYS_SHOWN = ['Open', 'Draft', 'OnHold'];

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

/** Every job, as a table or as a board with a column per status. */
export function RequisitionsPage({ initialData }: { initialData: RequisitionSummary[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const canCreate = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const [filters, setFilters] = useState<JobFilters>(NONE);
  const [viewId, setViewId] = useState<string | null>('all');
  const [view, setView] = useLocalStorageState('ats-jobs-layout', 'table');
  const [selected, setSelected] = useState<string[]>([]);
  const q = useDebouncedValue(filters.search.trim());

  // Any manual change leaves the saved view it started from.
  const setFilter = <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setViewId(null);
  };

  const all = useQuery({
    queryKey: ['requisitions', ''],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?search='),
    initialData,
  });
  const searched = useQuery({
    queryKey: ['requisitions', q],
    queryFn: () =>
      api.get<RequisitionSummary[]>(`/api/requisitions?search=${encodeURIComponent(q)}`),
    enabled: !!q,
  });
  const cacheKey = ['requisitions', q];
  const base = all.data ?? [];
  const found = q ? searched.data : base;

  // Drag a card to another column (or pick a status in the row menu) to change the job's status.
  // It moves at once and moves back if the server refuses (e.g. opening a job that needs approval).
  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: cacheKey });
      const before = queryClient.getQueryData<RequisitionSummary[]>(cacheKey);
      queryClient.setQueryData<RequisitionSummary[]>(cacheKey, (list) =>
        list?.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      return { before };
    },
    onError: (error: Error, _vars, context) => {
      queryClient.setQueryData(cacheKey, context?.before);
      toast.error('Could not change the job status', error.message);
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
    },
  });

  // Bulk change: one request per job through the same status endpoint, then one summary toast.
  const bulk = useMutation({
    mutationFn: async (target: string) => {
      const known = new Map([...base, ...(found ?? [])].map((job) => [job.id, job]));
      const jobs = selected.flatMap((id) => known.get(id) ?? []);
      const { change, skipped } = planStatusChange(jobs, target, (job) => canManageJob(user, job));
      const results = await Promise.allSettled(
        change.map((job) =>
          api.patch<void>(`/api/requisitions/${job.id}/status`, { status: target, reason: null }),
        ),
      );
      const failed = results.flatMap((result, i) =>
        result.status === 'rejected'
          ? [
              `${change[i].title}: ${(result.reason as Error)?.message ?? 'the change was not allowed'}`,
            ]
          : [],
      );
      return { target, changed: change.length - failed.length, failed, skipped: skipped.length };
    },
    onSuccess: ({ target, changed, failed, skipped }) => {
      const jobs = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;
      if (changed)
        toast.success(
          `${jobs(changed)} moved to ${humanize(target)}`,
          skipped
            ? `${jobs(skipped)} skipped. They are already there, or you can’t move them there.`
            : undefined,
        );
      else if (!failed.length)
        toast.error(
          'Nothing changed',
          `None of the selected jobs can move to ${humanize(target)}.`,
        );
      if (failed.length)
        toast.error(`${jobs(failed.length)} could not be changed`, failed.join('\n'));
      setSelected([]);
    },
    onError: (error: Error) => toast.error('Could not change the job status', error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['requisitions'] }),
  });

  const rows = (found ?? []).filter(
    (job) =>
      (!filters.statuses || filters.statuses.includes(job.status)) &&
      (!filters.mine || job.ownerEmail === user.email || job.recruiterEmail === user.email) &&
      (!filters.department || job.department === filters.department) &&
      (!filters.location || job.location === filters.location),
  );

  const count = (...statuses: string[]) =>
    base.filter((job) => statuses.includes(job.status)).length;
  const drafts = count('Draft', 'PendingApproval');
  const pending = count('PendingApproval');

  const columns: Column<RequisitionSummary>[] = [
    {
      id: 'title',
      header: 'Job title',
      hideable: false,
      className: 'max-w-72',
      cell: (job) => (
        <CellStack primary={job.title} secondary={`${job.department} · ${job.code}`} />
      ),
      sortValue: (job) => job.title,
    },
    {
      id: 'code',
      header: 'Job ID',
      defaultHidden: true,
      cell: (job) => job.code,
      sortValue: (job) => job.code,
    },
    {
      id: 'department',
      header: 'Department',
      defaultHidden: true,
      cell: (job) => job.department,
      sortValue: (job) => job.department,
    },
    {
      id: 'location',
      header: 'Location',
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
      id: 'applicants',
      header: 'Applicants',
      align: 'right',
      className: 'font-semibold text-primary tnum',
      cell: (job) => job.activeApplications,
      sortValue: (job) => job.activeApplications,
    },
    {
      id: 'openings',
      header: 'Openings',
      align: 'right',
      className: 'tnum',
      cell: (job) => job.openings,
      sortValue: (job) => job.openings,
    },
    {
      id: 'owner',
      header: 'Hiring manager',
      className: 'whitespace-nowrap',
      cell: (job) => nameFromEmail(job.ownerEmail),
      sortValue: (job) => nameFromEmail(job.ownerEmail),
      csv: (job) => job.ownerEmail,
    },
    {
      id: 'recruiter',
      header: 'Recruiter',
      defaultHidden: true,
      className: 'whitespace-nowrap',
      cell: (job) => nameFromEmail(job.recruiterEmail),
      sortValue: (job) => nameFromEmail(job.recruiterEmail),
      csv: (job) => job.recruiterEmail,
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
      className: 'whitespace-nowrap text-fg-muted',
      cell: (job) => <span title={formatDate(job.updatedAt)}>{formatRelative(job.updatedAt)}</span>,
      sortValue: (job) => job.updatedAt,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (job) => <StatusBadge status={job.status} />,
      sortValue: (job) => humanize(job.status),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      align: 'right',
      cell: (job) => (
        // Menu clicks bubble through the portal to the row; keep them from opening the job.
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RowActions label={`Actions for ${job.title}`}>
            <MenuItem icon={<Eye />} onSelect={() => router.push(`/jobs/${job.id}`)}>
              Open job
            </MenuItem>
            {canManageJob(user, job) && (
              <>
                <MenuItem
                  icon={<Pencil />}
                  onSelect={() => router.push(`/jobs/${job.id}/settings`)}
                >
                  Edit job
                </MenuItem>
                <MenuSeparator />
                <MenuSub>
                  <MenuSubTrigger icon={<CircleCheck />}>Change status</MenuSubTrigger>
                  <MenuSubContent>
                    {statusOptions(job.status).map((status) => (
                      <MenuItem key={status} onSelect={() => move.mutate({ id: job.id, status })}>
                        {humanize(status)}
                      </MenuItem>
                    ))}
                  </MenuSubContent>
                </MenuSub>
              </>
            )}
          </RowActions>
        </span>
      ),
    },
  ];

  const toolbar = (
    <>
      <SearchInput
        value={filters.search}
        onValueChange={(value) => setFilter('search', value)}
        placeholder="Search by job title or ID"
        className="w-full sm:w-72"
      />
      <FilterSelect
        allLabel="All departments"
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
        description="Find a job, see how many people applied, or change its status."
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

      <StatGrid className="mb-4">
        <StatCard
          icon={Briefcase}
          tone="blue"
          label="Open jobs"
          value={count('Open')}
          hint={`${count('OnHold')} on hold`}
        />
        <StatCard
          icon={Users}
          tone="violet"
          label="Active applications"
          value={base.reduce((sum, job) => sum + job.activeApplications, 0)}
        />
        <StatCard
          icon={FilePen}
          tone="amber"
          label="Draft jobs"
          value={drafts}
          hint={pending ? `${pending} waiting for approval` : undefined}
        />
        <StatCard
          icon={CircleCheck}
          tone="green"
          label="Filled"
          value={count('Filled')}
          hint={`${count('Closed')} closed`}
        />
      </StatGrid>

      <Card className="px-4 pt-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SavedViews
            storageKey="jobs"
            builtIn={VIEWS}
            current={filters}
            activeId={viewId}
            onApply={(saved) => {
              setFilters(saved.state);
              setViewId(saved.id);
            }}
          />
          <SegmentedControl
            aria-label="Layout"
            value={view}
            onValueChange={setView}
            items={[
              { value: 'table', label: 'Table', icon: <Rows3 /> },
              { value: 'board', label: 'Board', icon: <Kanban /> },
            ]}
          />
        </div>

        {/* Filters sit outside the table: the table remounts on a filter change (to reset paging),
            and the search box must keep focus while typing. */}
        <TableToolbar className="pb-0">{toolbar}</TableToolbar>
        {view === 'board' ? (
          <>
            {!found ? (
              <SkeletonRows rows={5} />
            ) : rows.length === 0 ? (
              empty
            ) : (
              <JobBoard
                jobs={rows}
                canMove={canCreate}
                onMove={(id, status) => move.mutate({ id, status })}
              />
            )}
          </>
        ) : (
          <DataTable
            // Remount on a filter change so paging starts again at page 1.
            key={JSON.stringify({ ...filters, search: q })}
            viewKey="jobs"
            exportName="jobs"
            noun="job"
            data={rows}
            columns={columns}
            getRowId={(job) => job.id}
            loading={!found}
            empty={empty}
            pageSize={10}
            onRowOpen={(job) => router.push(`/jobs/${job.id}`)}
            rowLabel={(job) => `Open ${job.title}`}
            selectable={canCreate}
            selected={selected}
            onSelectedChange={setSelected}
            bulkActions={
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    rightIcon={<ChevronDown />}
                    loading={bulk.isPending}
                  >
                    Change status
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>Move selected jobs to</MenuLabel>
                  {JOB_STATUS_TARGETS.map((status) => (
                    <MenuItem key={status} onSelect={() => bulk.mutate(status)}>
                      {humanize(status)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            }
          />
        )}
      </Card>
    </>
  );
}

/** Jobs in a column per status. Drag a card to change its status. */
function JobBoard({
  jobs,
  canMove,
  onMove,
}: {
  jobs: RequisitionSummary[];
  canMove: boolean;
  onMove: (id: string, status: string) => void;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const columns = STATUSES.filter(
    (s) => ALWAYS_SHOWN.includes(s) || jobs.some((job) => job.status === s),
  );
  return (
    <Board className="pt-3">
      {columns.map((status) => {
        const items = jobs.filter((job) => job.status === status);
        return (
          <BoardColumn
            key={status}
            title={humanize(status)}
            count={items.length}
            tone={statusTones[status] ?? 'gray'}
            menu={<span />}
            empty={canMove && status !== 'PendingApproval' ? 'Drop a job here' : 'No jobs'}
            // Pending approval only comes from submitting for approval, so nothing drops there.
            onDropItem={
              canMove && status !== 'PendingApproval'
                ? (id) => {
                    const job = jobs.find((j) => j.id === id);
                    if (job && job.status !== status) onMove(id, status);
                  }
                : undefined
            }
          >
            {items.map((job) => (
              <div
                key={job.id}
                {...rowLinkProps(`Open ${job.title}`, () => router.push(`/jobs/${job.id}`))}
                draggable={canMove}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', job.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(job.id);
                }}
                onDragEnd={() => setDragId(null)}
                className={cn(
                  'flex cursor-pointer flex-col gap-2 rounded-[9px] border border-border-subtle bg-card p-3 shadow-card transition-[box-shadow,transform] hover:border-border hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  canMove && 'cursor-grab active:cursor-grabbing',
                  dragId === job.id && 'rotate-1 opacity-60',
                )}
              >
                <p className="truncate text-2xs font-medium text-fg-subtle">
                  {job.department} · {job.code}
                </p>
                <p className="text-sm font-medium text-fg">{job.title}</p>
                <p className="text-xs text-fg-muted">
                  {job.location} · {job.workMode}
                </p>
                <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-2xs text-fg-subtle">
                  <span>
                    <b className="font-semibold text-primary tnum">{job.activeApplications}</b>{' '}
                    candidates · {job.openings} {job.openings === 1 ? 'opening' : 'openings'}
                  </span>
                  <Avatar name={nameFromEmail(job.ownerEmail)} size="xs" tone="blue" />
                </div>
              </div>
            ))}
          </BoardColumn>
        );
      })}
    </Board>
  );
}
