'use client';

import { useMemo, useState, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react';
import {
  CalendarDays,
  FileCheck2,
  GitCompareArrows,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  UserSearch,
  Users,
  UserX,
  Workflow,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CellStack,
  Checkbox,
  ConfirmDialog,
  CountBadge,
  EmptyState,
  FilterSelect,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RowActions,
  SearchInput,
  SegmentedControl,
  Select,
  SplitView,
  StatCard,
  StatGrid,
  TagsInput,
  Textarea,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { StageBadge, StatusBadge, stageTone } from '@/components/status';
import { formatDate, formatRelative } from '@/lib/format';
import { RejectManyModal } from '@/features/applicants/RejectManyModal';
import { FitDrawer } from '@/features/talent/FitDrawer';
import type {
  CandidateListApplication,
  CandidateListItem,
  CandidateListPage,
  DashboardData,
  RequisitionDetail,
  RequisitionSummary,
} from '@/types';
import { BLANK, candidateParams, DEFAULT_LIST_QUERY, type Filters } from './candidate-filters';
import { CandidatePreview, type PreviewPerson, SkillText } from './CandidatePreview';

const SENIORITY_OPTIONS = [
  'Junior',
  'Mid',
  'Senior',
  'Lead',
  'Manager',
  'Director',
  'Executive',
].map((value) => ({ value, label: `${value} and up` }));
const DEGREE_OPTIONS = [
  { value: 'HighSchool', label: 'High school or above' },
  { value: 'Associate', label: 'Associate or above' },
  { value: 'Bachelor', label: "Bachelor's or above" },
  { value: 'Master', label: "Master's or above" },
  { value: 'Doctorate', label: 'Doctorate' },
];
const SOURCE_OPTIONS = [
  'Direct applicant',
  'Referral',
  'LinkedIn',
  'Job board',
  'Portfolio site',
  'University fair',
  'Career fair',
  'Career site',
  'Resume import',
];
const SORT_OPTIONS = [
  { value: 'recent', label: 'Latest activity' },
  { value: 'name', label: 'Name' },
  { value: 'experience', label: 'Most experience' },
  { value: 'rating', label: 'Highest rating' },
];

type RankedCandidate = {
  candidateId: string;
  name: string;
  email: string;
  location?: string | null;
  currentTitle?: string | null;
  skills: string[];
  experienceYears?: number | null;
  score: number;
  matched: string[];
  missing: string[];
  dismissed: boolean;
  appliedToJob: boolean;
  fitScore?: number | null;
  hasEmbedding: boolean;
};
type RankResponse = {
  items: RankedCandidate[];
  total: number;
  page: number;
  pageSize: number;
  semantic: boolean;
  note?: string | null;
  pending: number;
  dismissed: number;
};
/** A segment or saved view of the list: what the server fetched, and how to start. */
export type ListStart = {
  initialData: CandidateListPage;
  initialFilters: Filters;
  initialDescribe?: string;
  /** Opened from a job (?job=): rank everyone against it straight away. */
  rank?: boolean;
  /** Set on /candidates/views/[id]. */
  view?: { id: string; name: string };
};

/** The side preview pane only exists from `lg` up (see SplitView). */
const wide = () => window.matchMedia('(min-width: 1024px)').matches;
/** The candidate id a row carries in its first cell. */
const rowId = (row: Element | null | undefined) =>
  (row?.querySelector('[data-row-id]') as HTMLElement | null)?.dataset.rowId;

/**
 * Everyone in one list: one row per person. Filters cover the person and their applications.
 * With a job chosen, rows show that job's stage and can be moved or rejected together, and
 * describing who you need ranks everyone on file against the job.
 */
export function CandidatesList({
  initialData,
  initialFilters,
  initialDescribe = '',
  rank: rankOnLoad,
  view,
}: ListStart) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const staff = ['Admin', 'Recruiter'].includes(user.role);
  const canManage = staff || user.role === 'HiringManager';
  // The segment's status stays when filters are cleared.
  const base: Filters = { ...BLANK, status: initialFilters.status };
  const initialQuery = candidateParams(initialFilters, 1).toString();

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [describe, setDescribe] = useState(initialDescribe);
  const [ranking, setRanking] = useState<{ jobId: string; query: string } | null>(
    staff && rankOnLoad && initialFilters.jobId ? { jobId: initialFilters.jobId, query: '' } : null,
  );
  const [rankPage, setRankPage] = useState(1);
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [targetStage, setTargetStage] = useState<string | null>(null);
  const [bulkRejectOpened, setBulkRejectOpened] = useState(false);
  const [rejecting, setRejecting] = useState<{
    name: string;
    app: CandidateListApplication;
  } | null>(null);
  const [fitFor, setFitFor] = useState<{ id: string; name: string } | null>(null);
  const [dismissFor, setDismissFor] = useState<RankedCandidate | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [saveOpened, setSaveOpened] = useState(false);
  // On a saved view the name is filled in, so saving again updates it (the API upserts by name).
  const [saveName, setSaveName] = useState(view?.name ?? '');

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      // A stage only means something inside its job.
      ...(key === 'jobId' ? { stageId: null } : {}),
    }));
    setPage(1);
    setSelected([]);
    if (key === 'jobId') setTargetStage(null);
  };
  const clearFilters = () => {
    setFilters(base);
    setPage(1);
    setSelected([]);
  };
  const anyFilter = JSON.stringify(filters) !== JSON.stringify(base);

  const jobs = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  const job = useQuery({
    queryKey: ['requisition', filters.jobId],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${filters.jobId}`),
    enabled: Boolean(filters.jobId),
  });
  const params = candidateParams(filters, page).toString();
  const list = useQuery({
    queryKey: ['candidates', params],
    queryFn: () => api.get<CandidateListPage>(`/api/candidates?${params}`),
    initialData: params === initialQuery ? initialData : undefined,
    placeholderData: (previous) => previous,
  });
  const rank = useQuery({
    queryKey: ['talent-rank', ranking, includeDismissed, rankPage],
    enabled: Boolean(ranking),
    placeholderData: (previous) => previous,
    queryFn: () =>
      api.post<RankResponse>('/api/talent/rank', {
        requisitionId: ranking!.jobId,
        query: ranking!.query || null,
        minYears: filters.minYears === '' ? null : Number(filters.minYears),
        location: filters.location || null,
        includeDismissed,
        page: rankPage,
        pageSize: 25,
      }),
  });

  // Describe who you need: with a job chosen it ranks against the job, otherwise AI sets filters.
  const toFilters = useMutation({
    mutationFn: () =>
      api.post<{
        q?: string;
        skills: string[];
        skillMode: 'any' | 'all';
        title?: string;
        location?: string;
        minYears?: number;
        seniority?: string;
        minDegree?: string;
        company?: string;
        school?: string;
      }>('/api/ai/search-filters', { query: describe }),
    onSuccess: (result) => {
      setFilters((current) => ({
        ...current,
        search: result.q ?? '',
        skills: result.skills ?? [],
        skillMode: result.skillMode ?? 'any',
        title: result.title ?? '',
        location: result.location ?? '',
        minYears: result.minYears ?? '',
        seniority: result.seniority ?? null,
        minDegree: result.minDegree ?? null,
        company: result.company ?? '',
        school: result.school ?? '',
      }));
      setPage(1);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const runDescribe = () => {
    if (filters.jobId) {
      setRanking({ jobId: filters.jobId, query: describe.trim() });
      setRankPage(1);
    } else if (describe.trim()) {
      toFilters.mutate();
    }
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['talent-rank'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
  };
  const moveMany = useMutation({
    mutationFn: (applicationIds: string[]) =>
      api.patch('/api/applications/bulk-stage', {
        applicationIds,
        stageId: targetStage,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      setSelected([]);
      setTargetStage(null);
      refreshAll();
      toast.success('Moved to the new stage');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Rejecting keeps each application in its own stage, so no stage needs picking first.
  const reject = useMutation({
    mutationFn: async ({ apps, reason }: { apps: CandidateListApplication[]; reason: string }) => {
      for (const app of apps)
        await api.patch(`/api/applications/${app.id}/stage`, {
          stageId: app.stageId,
          status: 'Rejected',
          dispositionReason: reason,
        });
    },
    onSuccess: (_result, { apps }) => {
      setSelected([]);
      setRejecting(null);
      setBulkRejectOpened(false);
      refreshAll();
      toast.success(
        apps.length === 1 ? 'Application rejected' : `${apps.length} applications rejected`,
      );
    },
    onError: (error: Error) => {
      refreshAll();
      toast.error(error.message);
    },
  });
  const addToJob = useMutation({
    mutationFn: (candidateId: string) =>
      api.post('/api/applications', {
        candidateId,
        requisitionId: ranking!.jobId,
        source: 'Existing candidate',
      }),
    onSuccess: () => {
      toast.success('Added to this job', 'Find them on its pipeline.');
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dismiss = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${ranking!.jobId}/dismissals`, {
        candidateId: dismissFor!.candidateId,
        reason: dismissReason.trim(),
      }),
    onSuccess: () => {
      toast.success(
        `${dismissFor?.name} is hidden from this job's ranking`,
        'Show dismissed to bring them back.',
      );
      setDismissFor(null);
      setDismissReason('');
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const undoDismiss = useMutation({
    mutationFn: (candidateId: string) =>
      api.delete(`/api/requisitions/${ranking!.jobId}/dismissals/${candidateId}`),
    onSuccess: refreshAll,
    onError: (error: Error) => toast.error(error.message),
  });
  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/saved-views', {
        area: 'talent',
        name: saveName.trim(),
        paramsJson: JSON.stringify({ filters, describe }),
      }),
    onSuccess: () => {
      setSaveOpened(false);
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
      toast.success('View saved', 'Find it in the sidebar under Saved views.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteView = useMutation({
    mutationFn: () => api.delete(`/api/saved-views/${view!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
      toast.success('View deleted');
      router.push('/candidates');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [deleteOpened, setDeleteOpened] = useState(false);

  const items = list.data?.items ?? [];
  const rankItems = rank.data?.items ?? [];
  // The application a row shows: the chosen job's, otherwise the most recent.
  const shownApp = (person: CandidateListItem) =>
    filters.jobId
      ? person.applications.find((app) => app.requisitionId === filters.jobId)
      : person.applications[0];
  const people: PreviewPerson[] = ranking
    ? rankItems.map((item) => ({
        id: item.candidateId,
        name: item.name,
        email: item.email,
        currentTitle: item.currentTitle,
        location: item.location,
        skills: item.skills,
        matchedTerms: item.matched,
      }))
    : items;
  // The side pane is closed until a row is opened for preview.
  const preview = people.find((person) => person.id === previewId);

  const selectedApps = useMemo(
    () =>
      items
        .filter((person) => selected.includes(person.id))
        .map((person) => person.applications.find((app) => app.requisitionId === filters.jobId))
        .filter((app): app is CandidateListApplication => Boolean(app)),
    [items, selected, filters.jobId],
  );
  const canBulk = canManage && Boolean(filters.jobId) && !ranking;

  const jobOptions =
    jobs.data?.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` })) ?? [];
  const stageOptions = filters.jobId
    ? (job.data?.stages.map((stage) => ({ value: stage.id, label: stage.name })) ?? [])
    : [];
  const rankJobTitle = jobs.data?.find((item) => item.id === ranking?.jobId)?.title;

  // Click opens the preview (the profile on a narrow screen); Enter and double-click open the
  // profile; up and down walk the rows and the preview follows.
  const openRow = (id: string) => (wide() ? setPreviewId(id) : router.push(`/candidates/${id}`));
  const onRowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = event.target as HTMLElement;
    if (row.tagName !== 'TR') return;
    if (event.key === 'Enter') {
      const id = rowId(row);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(`/candidates/${id}`);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (
        event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling
      ) as HTMLElement | null;
      const id = rowId(next);
      if (next && id) {
        next.focus();
        setPreviewId(id);
      }
    }
  };
  const onRowDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const id = rowId((event.target as HTMLElement).closest('tbody tr'));
    if (id) router.push(`/candidates/${id}`);
  };
  const previewing = (id: string) => (id === previewId ? 'bg-accent hover:bg-accent' : undefined);
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast(`Copied ${email}`);
  };

  // Headline numbers: everyone on file (the unfiltered list, shared with the list's cache) and
  // the active pipeline from the dashboard summary.
  const everyone = useQuery({
    queryKey: ['candidates', DEFAULT_LIST_QUERY],
    queryFn: () => api.get<CandidateListPage>(`/api/candidates?${DEFAULT_LIST_QUERY}`),
    initialData: initialQuery === DEFAULT_LIST_QUERY ? initialData : undefined,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });
  const pipeline = dashboard.data?.pipeline ?? [];
  const inStages = (test: (stage: string) => boolean) =>
    dashboard.data
      ? pipeline.filter((row) => test(row.stage)).reduce((sum, row) => sum + row.count, 0)
      : '–';

  const total = ranking ? (rank.data?.total ?? 0) : (list.data?.total ?? 0);
  const pageSize = ranking ? (rank.data?.pageSize ?? 25) : (list.data?.pageSize ?? 25);
  // Filters behind "More filters": everything but search, job, stage, status and sort.
  const moreCount = (Object.keys(BLANK) as (keyof Filters)[]).filter(
    (key) =>
      !['search', 'jobId', 'stageId', 'status', 'sort'].includes(key) &&
      JSON.stringify(filters[key]) !== JSON.stringify(BLANK[key]),
  ).length;

  const label = (text: string) => <p className="mb-1.5 text-xs text-fg-subtle">{text}</p>;
  const moreFilters = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" leftIcon={<SlidersHorizontal />}>
          More filters
          {moreCount > 0 && <CountBadge count={moreCount} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,640px)] w-[min(92vw,520px)] overflow-y-auto"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {label('Minimum rating')}
            <SegmentedControl
              size="sm"
              aria-label="Minimum rating"
              value={filters.minRating ?? 'any'}
              onValueChange={(value) => set('minRating', value === 'any' ? null : value)}
              items={['any', '1', '2', '3', '4', '5'].map((value) => ({
                value,
                label: value === 'any' ? 'Any' : value,
              }))}
            />
          </div>
          <div>
            {label('Resume')}
            <SegmentedControl
              size="sm"
              aria-label="Resume"
              value={filters.hasResume ?? 'any'}
              onValueChange={(value) => set('hasResume', value === 'any' ? null : value)}
              items={[
                { value: 'any', label: 'Any' },
                { value: 'true', label: 'Read' },
                { value: 'false', label: 'Not yet' },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <TagsInput
              label="Skills"
              placeholder="Type a skill and press Enter"
              value={filters.skills}
              onChange={(value) =>
                set(
                  'skills',
                  value.map((item) => item.toLowerCase()),
                )
              }
            />
            <SegmentedControl
              className="mt-2"
              size="sm"
              aria-label="Skill match"
              value={filters.skillMode}
              onValueChange={(value) => set('skillMode', value)}
              items={[
                { value: 'any', label: 'Any of them' },
                { value: 'all', label: 'All of them' },
              ]}
            />
          </div>
          <Input
            label="Job title"
            value={filters.title}
            onChange={(event) => set('title', event.currentTarget.value)}
          />
          <Input
            label="Location"
            value={filters.location}
            onChange={(event) => set('location', event.currentTarget.value)}
          />
          <NumberInput
            label="Minimum years of experience"
            min={0}
            max={50}
            value={filters.minYears === '' ? '' : Number(filters.minYears)}
            onValueChange={(value) => set('minYears', value)}
          />
          <Select
            label="Minimum seniority"
            clearable
            placeholder="Any seniority"
            data={SENIORITY_OPTIONS}
            value={filters.seniority}
            onChange={(value) => set('seniority', value)}
          />
          <Select
            label="Minimum degree"
            clearable
            placeholder="Any degree"
            data={DEGREE_OPTIONS}
            value={filters.minDegree}
            onChange={(value) => set('minDegree', value)}
          />
          <Select
            label="Source"
            clearable
            placeholder="Any source"
            data={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(value) => set('source', value)}
          />
          <Input
            label="Worked at"
            value={filters.company}
            onChange={(event) => set('company', event.currentTarget.value)}
          />
          <Input
            label="Studied at"
            value={filters.school}
            onChange={(event) => set('school', event.currentTarget.value)}
          />
          <Checkbox
            className="sm:col-span-2"
            label="Include people marked do not contact"
            checked={filters.includeDnc}
            onCheckedChange={(checked) => set('includeDnc', checked)}
          />
        </div>
        {anyFilter && (
          <Button variant="link" size="sm" className="mt-4" onClick={clearFilters}>
            Clear all filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );

  const describeBar = staff && (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Describe who you need"
        placeholder={
          filters.jobId
            ? 'Describe who you need for this job, then rank everyone on file'
            : 'Describe who you need, and AI sets the filters'
        }
        value={describe}
        onChange={(event) => setDescribe(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') runDescribe();
        }}
        leftSection={<Sparkles />}
        className="min-w-[260px] flex-1"
      />
      <Button
        variant="soft"
        onClick={runDescribe}
        loading={toFilters.isPending}
        disabled={!filters.jobId && !describe.trim()}
      >
        {filters.jobId ? 'Rank for this job' : 'Set filters'}
      </Button>
      {view && (
        <Button variant="danger-quiet" leftIcon={<Trash2 />} onClick={() => setDeleteOpened(true)}>
          Delete view
        </Button>
      )}
      <Popover open={saveOpened} onOpenChange={setSaveOpened}>
        <PopoverTrigger asChild>
          <Button variant="secondary">{view ? 'Update view' : 'Save view'}</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="flex flex-col gap-3">
            <Input
              label="Name"
              placeholder="For example, Chicago React leads"
              value={saveName}
              onChange={(event) => setSaveName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && saveName.trim()) saveView.mutate();
              }}
              autoFocus
            />
            <Button
              size="sm"
              disabled={!saveName.trim()}
              loading={saveView.isPending}
              onClick={() => saveView.mutate()}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  const rankColumns: Column<RankedCandidate>[] = [
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      className: 'w-[70px] text-lg font-light tnum',
      cell: (item) => Math.round(item.score),
      csv: (item) => Math.round(item.score),
      hideable: false,
    },
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      cell: (item) => (
        <div className="flex items-center gap-3" data-row-id={item.candidateId}>
          <Avatar name={item.name} />
          <CellStack primary={item.name} secondary={item.currentTitle} />
        </div>
      ),
      csv: (item) => item.name,
    },
    {
      id: 'matches',
      header: 'Matches',
      className: 'whitespace-normal',
      cell: (item) =>
        item.matched.length ? (
          <SkillText
            person={{
              id: item.candidateId,
              name: item.name,
              email: item.email,
              skills: item.matched,
              matchedTerms: item.matched,
            }}
            limit={6}
          />
        ) : (
          <span className="text-fg-subtle">No direct matches</span>
        ),
      csv: (item) => item.matched.join(', '),
    },
    {
      id: 'job',
      header: 'This job',
      className: 'w-[130px]',
      cell: (item) => (
        <CellStack
          primary={
            item.dismissed ? (
              <span className="font-normal text-fg-subtle">Dismissed</span>
            ) : item.appliedToJob ? (
              'Applied'
            ) : (
              <span className="font-normal text-fg-subtle">Not yet</span>
            )
          }
          secondary={item.fitScore != null ? `AI match ${item.fitScore}%` : undefined}
        />
      ),
      csv: (item) => (item.dismissed ? 'Dismissed' : item.appliedToJob ? 'Applied' : 'Not yet'),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      align: 'right',
      className: 'w-14',
      hideable: false,
      cell: (item) => (
        <div onClick={stop}>
          <RowActions label={`Actions for ${item.name}`}>
            {!item.appliedToJob && !item.dismissed && (
              <MenuItem onSelect={() => addToJob.mutate(item.candidateId)}>
                Add to this job
              </MenuItem>
            )}
            <MenuItem onSelect={() => setFitFor({ id: item.candidateId, name: item.name })}>
              Why they rank here
            </MenuItem>
            <MenuItem onSelect={() => router.push(`/candidates/${item.candidateId}`)}>
              Open profile
            </MenuItem>
            <MenuItem onSelect={() => copyEmail(item.email)}>Copy email</MenuItem>
            <MenuSeparator />
            {item.dismissed ? (
              <MenuItem onSelect={() => undoDismiss.mutate(item.candidateId)}>Bring back</MenuItem>
            ) : (
              <MenuItem danger onSelect={() => setDismissFor(item)}>
                Dismiss for this job…
              </MenuItem>
            )}
          </RowActions>
        </div>
      ),
    },
  ];

  const jobsById = new Map(jobs.data?.map((item) => [item.id, item]));
  const showFit = items.some((person) => shownApp(person)?.fitScore != null);
  const listColumns: Column<CandidateListItem>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      className: 'max-w-[280px]',
      cell: (person) => (
        <div className="flex items-center gap-3" data-row-id={person.id}>
          <Avatar name={person.name} />
          <CellStack
            primary={
              <span className="flex items-center gap-1.5">
                <span className="truncate">{person.name}</span>
                {person.doNotContact && (
                  <Badge tone="red" size="sm">
                    Do not contact
                  </Badge>
                )}
              </span>
            }
            secondary={person.email}
          />
        </div>
      ),
      csv: (person) => `${person.name} <${person.email}>`,
    },
    {
      id: 'job',
      header: 'Applied for',
      className: 'max-w-[240px]',
      cell: (person) => {
        const app = shownApp(person);
        if (!app) return <span className="text-fg-subtle">No job yet</span>;
        const department = jobsById.get(app.requisitionId)?.department;
        return (
          <CellStack
            primary={app.requisitionTitle}
            secondary={[
              department || app.requisitionCode,
              person.applications.length > 1 ? `+${person.applications.length - 1} more` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      },
      csv: (person) => shownApp(person)?.requisitionTitle,
    },
    ...(showFit
      ? [
          {
            id: 'fit',
            header: 'AI match',
            cell: (person: CandidateListItem) => {
              const fit = shownApp(person)?.fitScore;
              return fit != null ? (
                <span
                  className={fit >= 75 ? 'font-medium text-tone-green-fg tnum' : 'font-medium tnum'}
                >
                  {fit}%
                </span>
              ) : (
                <span className="text-fg-subtle">–</span>
              );
            },
            csv: (person: CandidateListItem) => shownApp(person)?.fitScore,
          },
        ]
      : []),
    {
      id: 'source',
      header: 'Source',
      className: 'text-fg-muted',
      cell: (person) => person.source,
      csv: (person) => person.source,
    },
    {
      id: 'applied',
      header: 'Applied',
      className: 'whitespace-nowrap',
      cell: (person) => {
        const app = shownApp(person);
        return (
          <>
            <div className="tnum">{app ? formatDate(app.appliedAt) : '–'}</div>
            <div className="mt-0.5 text-xs text-fg-subtle">
              Last active {formatRelative(app?.lastActivityAt ?? person.updatedAt)}
            </div>
          </>
        );
      },
      csv: (person) => shownApp(person)?.appliedAt,
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: (person) => {
        const app = shownApp(person);
        if (!app) return <span className="text-fg-subtle">–</span>;
        return app.status === 'Active' ? (
          <StageBadge stage={app.stage} />
        ) : (
          <StatusBadge status={app.status} />
        );
      },
      csv: (person) => {
        const app = shownApp(person);
        return app && (app.status === 'Active' ? app.stage : app.status);
      },
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      align: 'right',
      className: 'w-14',
      hideable: false,
      cell: (person) => {
        const app = shownApp(person);
        return (
          <div onClick={stop}>
            <RowActions label={`Actions for ${person.name}`}>
              <MenuItem onSelect={() => router.push(`/candidates/${person.id}`)}>
                Open profile
              </MenuItem>
              {person.applications.map((item) => (
                <MenuItem key={item.id} onSelect={() => router.push(`/applications/${item.id}`)}>
                  Open {item.requisitionTitle}
                </MenuItem>
              ))}
              {person.email !== 'Restricted' && (
                <MenuItem onSelect={() => copyEmail(person.email)}>Copy email</MenuItem>
              )}
              {canManage && app?.status === 'Active' && (
                <>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setRejecting({ name: person.name, app })}>
                    Reject from {app.requisitionTitle}…
                  </MenuItem>
                </>
              )}
            </RowActions>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <>
      <SearchInput
        placeholder="Search names, resumes, skills"
        value={filters.search}
        onValueChange={(value) => set('search', value)}
        className="w-full sm:w-72"
      />
      <FilterSelect
        aria-label="Job"
        allLabel="All jobs"
        data={jobOptions}
        value={filters.jobId}
        onChange={(value) => set('jobId', value)}
      />
      {filters.jobId && (
        <FilterSelect
          aria-label="Stage"
          allLabel="All stages"
          data={stageOptions}
          value={filters.stageId}
          onChange={(value) => set('stageId', value)}
        />
      )}
      {ranking ? (
        <>
          <Checkbox
            label={`Show dismissed${rank.data?.dismissed ? ` (${rank.data.dismissed})` : ''}`}
            checked={includeDismissed}
            onCheckedChange={setIncludeDismissed}
          />
          <Button variant="secondary" leftIcon={<X />} onClick={() => setRanking(null)}>
            Back to the list
          </Button>
        </>
      ) : (
        <FilterSelect
          aria-label="Sort"
          allLabel={SORT_OPTIONS[0].label}
          data={SORT_OPTIONS.slice(1)}
          value={filters.sort === SORT_OPTIONS[0].value ? null : filters.sort}
          onChange={(value) => set('sort', value ?? SORT_OPTIONS[0].value)}
        />
      )}
      {moreFilters}
    </>
  );

  // Compare works on any two or three people; move and reject need a job to act inside.
  const compareAction = (
    <Button
      size="sm"
      variant="secondary"
      leftIcon={<GitCompareArrows />}
      disabled={selected.length < 2 || selected.length > 3}
      title={selected.length > 3 ? 'Compare up to three people' : undefined}
      onClick={() => router.push(`/candidates/compare?ids=${selected.join(',')}`)}
    >
      Compare
    </Button>
  );
  const bulkActions = (
    <>
      {compareAction}
      {canBulk && (
        <>
          <Select
            size="sm"
            aria-label="Move to stage"
            placeholder="Move to stage"
            value={targetStage}
            onChange={setTargetStage}
            data={stageOptions}
            className="w-48"
          />
          <Button
            size="sm"
            leftIcon={<UserCheck />}
            disabled={!targetStage || selectedApps.length === 0}
            loading={moveMany.isPending}
            onClick={() => moveMany.mutate(selectedApps.map((app) => app.id))}
          >
            Move
          </Button>
          <Button
            size="sm"
            variant="danger-quiet"
            leftIcon={<UserX />}
            disabled={selectedApps.filter((app) => app.status === 'Active').length === 0}
            onClick={() => setBulkRejectOpened(true)}
          >
            Reject
          </Button>
        </>
      )}
    </>
  );

  const tableProps = {
    toolbar,
    selectable: true,
    selected,
    onSelectedChange: setSelected,
    bulkActions,
    noun: 'candidate',
  };
  const listTable = (
    <DataTable
      {...tableProps}
      viewKey="candidates"
      exportName="candidates"
      data={items}
      columns={listColumns}
      getRowId={(person) => person.id}
      loading={!list.data}
      onRowOpen={(person) => openRow(person.id)}
      rowLabel={(person) => person.name}
      rowClassName={(person) => previewing(person.id)}
      pagination={{ page, pageSize, total, onPageChange: setPage }}
      empty={
        <EmptyState
          icon={UserSearch}
          title="Nobody matches these filters"
          description={anyFilter ? 'Try using fewer filters.' : undefined}
          action={
            anyFilter && (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            )
          }
        />
      }
    />
  );
  const rankTable = (
    <>
      {rank.data?.note && (
        <Alert tone="warning" className="mt-3">
          {rank.data.note}
        </Alert>
      )}
      {!!rank.data?.pending && (
        <p className="mt-3 text-sm text-fg-subtle">
          {rank.data.pending === 1 ? '1 resume is' : `${rank.data.pending} resumes are`} still being
          read. They join the ranking when they are done.
        </p>
      )}
      <DataTable
        {...tableProps}
        viewKey="candidates-rank"
        exportName="candidates-ranked"
        data={rankItems}
        columns={rankColumns}
        getRowId={(item) => item.candidateId}
        loading={!rank.data}
        onRowOpen={(item) => openRow(item.candidateId)}
        rowLabel={(item) => item.name}
        rowClassName={(item) =>
          [item.dismissed && 'opacity-55', previewing(item.candidateId)].filter(Boolean).join(' ')
        }
        pagination={{ page: rankPage, pageSize, total, onPageChange: setRankPage }}
        empty={<EmptyState icon={UserSearch} title="Nobody on file matches this job yet" />}
      />
    </>
  );

  return (
    <>
      <StatGrid className="mb-5">
        <StatCard
          icon={Users}
          tone="violet"
          label="Total candidates"
          value={everyone.data?.total ?? '–'}
        />
        <StatCard
          icon={Workflow}
          tone="blue"
          label="Active applications"
          value={dashboard.data?.activeCandidates ?? '–'}
          hint={dashboard.data && `Across ${dashboard.data.openRequisitions} open jobs`}
        />
        <StatCard
          icon={CalendarDays}
          tone="green"
          label="In interview"
          value={inStages((stage) => stageTone(stage) === 'blue')}
          hint={
            dashboard.data && `${dashboard.data.interviewsThisWeek} interviews in the next 7 days`
          }
        />
        <StatCard
          icon={FileCheck2}
          tone="amber"
          label="At offer"
          value={inStages((stage) => /offer/i.test(stage))}
        />
      </StatGrid>

      <SplitView
        storageKey="candidates"
        sideOpen={Boolean(preview)}
        main={
          <Card className="min-w-0 px-4 pt-4">
            {describeBar}
            {ranking && (
              <h2 className="mt-4 text-md font-semibold text-fg">
                Ranked for {rankJobTitle ?? 'this job'}
              </h2>
            )}
            <div aria-live="polite" className="sr-only">
              {ranking
                ? `Ranked for ${rankJobTitle ?? 'this job'}`
                : `${total} ${total === 1 ? 'person' : 'people'}`}
            </div>
            <div onKeyDownCapture={onRowKeys} onDoubleClick={onRowDoubleClick}>
              {ranking ? rankTable : listTable}
            </div>
          </Card>
        }
        side={
          preview && (
            <CandidatePreview
              key={preview.id}
              person={preview}
              onClose={() => setPreviewId(null)}
              onFilter={(patch) => {
                setFilters((current) => ({ ...current, ...patch }));
                setPage(1);
              }}
            />
          )
        }
      />

      {view && (
        <ConfirmDialog
          opened={deleteOpened}
          onClose={() => setDeleteOpened(false)}
          onConfirm={() =>
            deleteView.mutateAsync().then(
              () => undefined,
              () => undefined,
            )
          }
          title={`Delete the view “${view.name}”?`}
          message="This removes the saved filters only. No candidate records change."
          confirmLabel="Delete view"
        />
      )}
      <RejectManyModal
        opened={bulkRejectOpened}
        onClose={() => setBulkRejectOpened(false)}
        loading={reject.isPending}
        onReject={(reason) =>
          reject.mutate({ apps: selectedApps.filter((app) => app.status === 'Active'), reason })
        }
      />
      <RejectManyModal
        opened={rejecting !== null}
        onClose={() => setRejecting(null)}
        loading={reject.isPending}
        title={rejecting ? `Reject ${rejecting.name}` : undefined}
        onReject={(reason) => rejecting && reject.mutate({ apps: [rejecting.app], reason })}
      />
      {ranking && (
        <FitDrawer
          requisitionId={ranking.jobId}
          candidate={fitFor}
          onClose={() => setFitFor(null)}
        />
      )}
      <Modal
        opened={dismissFor !== null}
        onClose={() => setDismissFor(null)}
        title={dismissFor ? `Dismiss ${dismissFor.name} for this job` : 'Dismiss'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDismissFor(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!dismissReason.trim()}
              loading={dismiss.isPending}
              onClick={() => dismiss.mutate()}
            >
              Dismiss
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          description="We save this with the decision. Keep it about the job."

          value={dismissReason}
          onChange={(event) => setDismissReason(event.currentTarget.value)}
          minRows={2}
        />
      </Modal>
    </>
  );
}
