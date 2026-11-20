'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  EyeOff,
  GitCompareArrows,
  Layers,
  Mail,
  MailX,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Copy,
  Lock,
  CircleMinus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UserCheck,
  UserPlus,
  UserSearch,
  UserX,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseAsBoolean, useQueryStates } from 'nuqs';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { asJob, useAbility } from '@/lib/ability';
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
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  Modal,
  MultiSelect,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RowActions,
  SegmentedControl,
  Select,
  Spinner,
  SplitView,
  TagsInput,
  Textarea,
  Tooltip,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { StageBadge, StatusBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { RejectManyModal } from '@/features/applicants/RejectManyModal';
import { FitDrawer } from '@/features/talent/FitDrawer';
import { BulkEmailDrawer } from '@/features/messages/BulkEmailDrawer';
import type {
  CandidateListApplication,
  CandidateListItem,
  CandidateListPage,
  RequisitionDetail,
  RequisitionSummary,
} from '@/types';
import { ApplyModal } from './ApplyModal';
import {
  BulkTagsModal,
  DismissModal,
  DoNotContactModal,
  useBulkCandidates,
  useTagOptions,
  type BulkTarget,
} from './candidate-actions';
import {
  BLANK,
  candidateParams,
  clearChip,
  customFilters,
  EMPLOYMENT_LABELS,
  FIELD_LABELS,
  filterChips,
  filterParsers,
  filterUrlKeys,
  LANGUAGE_LEVEL_LABELS,
  listParsers,
  routeFilters,
  sameFilters,
  STAGE_TYPE_LABELS,
  viewLayout,
  viewParams,
  type Filters,
  type SavedViewRow,
  type ViewLayout,
} from './candidate-filters';
import { AddToPoolModal, PoolFormModal, type TalentPool } from './talent-pools';
import { hasOptions, useCustomFields } from './custom-fields';
import { CandidatePreview, type PreviewPerson, SkillText } from './CandidatePreview';
import { sourceOptions, useSources } from '@/features/sources/sources-data';
import type { Question } from '@/features/careers/questions';

const STAGE_TYPES = ['Applied', 'Screen', 'Interview', 'Offer', 'Hired'];

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
const SORT_OPTIONS = [
  { value: 'recent', label: 'Latest activity' },
  { value: 'created', label: 'Newest added' },
  { value: 'name', label: 'Name' },
  { value: 'experience', label: 'Most experience' },
  { value: 'rating', label: 'Highest rating' },
  { value: 'fit', label: 'Best AI fit' },
  { value: 'applied', label: 'Latest application' },
  { value: 'idle', label: 'Waiting longest' },
];
const asOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
const IDLE_OPTIONS = [3, 7, 14, 30].map((days) => ({
  value: String(days),
  label: `${days} days or more`,
}));
const FIT_OPTIONS = [50, 60, 70, 80, 90].map((score) => ({
  value: String(score),
  label: `${score}% or more`,
}));

/** A text filter that applies when you leave the box or press Enter, not on every key. */
function TextFilter({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <Input
      label={label}
      defaultValue={value}
      key={`${label}-${value}`}
      onBlur={(event) => onCommit(event.currentTarget.value.trim())}
      onKeyDown={(event) => event.key === 'Enter' && onCommit(event.currentTarget.value.trim())}
    />
  );
}

type RankedCandidate = {
  candidateId: string;
  name: string;
  email: string;
  location?: string | null;
  currentTitle?: string | null;
  skills: string[];
  experienceYears?: number | null;
  /** Does the resume reach the job's minimum years? Null when either is unknown. */
  yearsMet?: boolean | null;
  /** The one match number: 40 percent requirements met, 60 percent closeness in meaning. */
  score: number;
  keywordScore?: number | null;
  semanticScore?: number | null;
  matched: string[];
  missing: string[];
  dismissed: boolean;
  appliedToJob: boolean;
  fitScore?: number | null;
  fitAt?: string | null;
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
  /** The best 50 ids in order, for "Check fit for the top 25". */
  topIds: string[];
};
type AiFilters = {
  q?: string;
  skills: string[];
  excludeSkills?: string[];
  skillMode: 'any' | 'all';
  minSkillYears?: number;
  title?: string;
  location?: string;
  country?: string;
  region?: string;
  city?: string;
  openToRemote?: boolean;
  willingToRelocate?: boolean;
  minYears?: number;
  minManagementYears?: number;
  seniority?: string;
  minDegree?: string;
  field?: string;
  employmentType?: string;
  language?: string;
  languageLevel?: string;
  certification?: string;
  company?: string;
  school?: string;
  tags?: string[];
  source?: string;
  minRating?: number;
  idleDays?: number;
  sort?: string;
};

/** A segment or saved view of the list: what the server fetched, and the filters it starts from. */
export type ListStart = {
  initialData: CandidateListPage;
  /** The segment's or saved view's filters, used until the address bar carries its own. */
  baseFilters: Filters;
  initialDescribe?: string;
  /** Set on /candidates/views/[id]. */
  view?: SavedViewRow;
  /** Set on /candidates/pools/[id]. */
  pool?: TalentPool;
};

const stateParsers = {
  ...filterParsers,
  ...listParsers,
  /** On a saved view: the address bar filters replace the view's, even when blank. */
  edited: parseAsBoolean.withDefault(false),
};
const FILTER_KEYS = Object.keys(filterParsers) as (keyof typeof filterParsers)[];

/** The side preview pane only exists from `lg` up (see SplitView). */
const wide = () => window.matchMedia('(min-width: 1024px)').matches;
/** The candidate id a row carries in its first cell. */
const rowId = (row: Element | null | undefined) =>
  (row?.querySelector('[data-row-id]') as HTMLElement | null)?.dataset.rowId;

/** A line of the resume with the searched words marked (the server wraps them in ⟦ ⟧). */
function Snippet({ text }: { text: string }) {
  // Start a few words before the first match so the mark is visible in a one-line cell.
  const first = text.indexOf('⟦');
  const from = first > 32 ? text.indexOf(' ', first - 32) + 1 : 0;
  return (
    <span className="block truncate text-xs text-fg-subtle">
      {from > 0 && '…'}
      {text
        .slice(from)
        .split(/[⟦⟧]/)
        .map((part, index) =>
          index % 2 ? (
            <mark key={index} className="rounded-xs bg-tone-amber-bg px-0.5 text-fg">
              {part}
            </mark>
          ) : (
            part
          ),
        )}
    </span>
  );
}

/** Where the person is: the application that matches the job, segment or stage type, else the latest. */
function shownApp(person: CandidateListItem, filters: Filters) {
  const match = person.applications.find(
    (app) =>
      (!filters.jobId || app.requisitionId === filters.jobId) &&
      (!filters.status || app.status === filters.status) &&
      (!filters.stageType || app.stageType === filters.stageType),
  );
  return match ?? (filters.jobId ? undefined : person.applications[0]);
}

type DialogKind = 'job' | 'tags' | 'dnc' | 'delete' | 'reject' | 'pool' | 'dismiss' | 'email';

/** Custom field answers on a list row, as text. */
type CustomFieldsRow = { customFields?: Record<string, string> };

/** On a pool's list, who added the person and when. */
type PoolInfo = { pool?: { addedBy: string; addedByName: string; addedAt: string } | null };

/** The one match number, with what it is made of in a popover. */
function MatchCell({
  item,
  aiOn,
  onWhy,
}: {
  item: RankedCandidate;
  aiOn: boolean;
  onWhy: () => void;
}) {
  const total = item.matched.length + item.missing.length;
  const tone =
    item.score >= 75 ? 'text-tone-green-fg' : item.score < 40 ? 'text-fg-muted' : 'text-fg';
  return (
    <span
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Match ${item.score} percent. Show what it is made of`}
            className={cn(
              'rounded-md px-1.5 py-0.5 text-md font-semibold tnum underline decoration-dotted decoration-fg-subtle underline-offset-4 hover:bg-secondary',
              tone,
            )}
          >
            {item.score}%
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3 text-sm">
          <p className="text-base font-semibold text-fg">Match {item.score}%</p>
          {total > 0 && (
            <div>
              <p className="mb-1.5 text-fg-muted">
                Meets {item.matched.length} of {total} requirements
                {item.keywordScore != null && ` (${item.keywordScore}% by weight)`}
              </p>
              <ul className="space-y-1">
                {item.matched.map((text) => (
                  <li key={text} className="flex gap-2 text-fg">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-tone-green-fg"
                      aria-label="Met"
                    />
                    {text}
                  </li>
                ))}
                {item.missing.map((text) => (
                  <li key={text} className="flex gap-2 text-fg-muted">
                    <X className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-label="Not found" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {item.experienceYears != null && (
            <p className="text-fg-muted">
              {item.experienceYears} {item.experienceYears === 1 ? 'year' : 'years'} of experience
              {item.yearsMet === true && ', enough for this job'}
              {item.yearsMet === false && ', less than this job asks for'}
            </p>
          )}
          <p className="text-fg-muted">
            {item.semanticScore != null
              ? `Close in meaning to the job: ${item.semanticScore}%`
              : item.hasEmbedding
                ? 'Closeness in meaning is not counted for this job yet.'
                : 'Their resume has not been read for meaning yet.'}
          </p>
          {item.fitScore != null && (
            <p className="text-fg-muted">
              AI fit check: <span className="font-medium text-fg">{item.fitScore}%</span>
              {item.fitAt && ` · ${formatRelative(item.fitAt)}`}
            </p>
          )}
          {aiOn && (
            <Button size="sm" variant="secondary" leftIcon={<Sparkles />} onClick={onWhy}>
              {item.fitScore != null ? 'Open the fit check' : 'Check fit with AI'}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

function StageCell({ app, staleDays }: { app?: CandidateListApplication; staleDays: number }) {
  if (!app) return <span className="text-fg-subtle">Not in a job</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1.5">
        {app.status === 'Active' ? (
          <StageBadge stage={app.stage} type={app.stageType} color={app.stageColor} />
        ) : (
          <StatusBadge status={app.status} />
        )}
        {app.unreadMessages > 0 && (
          <Tooltip
            label={`${app.unreadMessages} unread ${app.unreadMessages === 1 ? 'message' : 'messages'}`}
          >
            <span
              className="size-2 rounded-full bg-primary"
              aria-label={`${app.unreadMessages} unread ${app.unreadMessages === 1 ? 'message' : 'messages'}`}
            />
          </Tooltip>
        )}
      </span>
      {app.stalled && (
        <span className="text-2xs whitespace-nowrap text-tone-amber-fg">
          No movement in {staleDays}+ days
        </span>
      )}
    </div>
  );
}

/**
 * Everyone in one list: one row per person. Filters live in the address bar and show as chips.
 * With a job chosen, rows show that job's stage and can be moved or rejected together; "Find" ranks
 * everyone on file against a job.
 */
export function CandidatesList({
  initialData,
  baseFilters,
  initialDescribe = '',
  view,
  pool,
}: ListStart) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const ability = useAbility();
  // Tags, pools, do not contact and ranking: whoever keeps the candidate records.
  const staff = ability.can('update', 'Candidate');
  // Adding people to jobs (and the filters and views that go with it): the hiring team.
  const canManage = ability.can('create', 'Application');
  const canEmail = ability.can('send', 'Message');
  const aiOn = staff && user.aiEnabled !== false;

  // ---- Filters, from the address bar (or the segment or view until it has any) ----
  const [url, setUrl] = useQueryStates(stateParsers, { urlKeys: filterUrlKeys });
  const urlKeys = FILTER_KEYS.map((key) => (filterUrlKeys as Record<string, string>)[key] ?? key);
  const fromUrl = url.edited || urlKeys.some((key) => searchParams.has(key));
  const filters: Filters = fromUrl
    ? {
        ...(Object.fromEntries(FILTER_KEYS.map((key) => [key, url[key]])) as Omit<
          Filters,
          'status' | 'hasApplications' | 'poolId'
        >),
        ...routeFilters(baseFilters),
      }
    : baseFilters;
  const page = url.page;
  const rankJobId = staff ? url.find : null;
  const segmentBlank: Filters = { ...BLANK, ...routeFilters(baseFilters) };

  const [selected, setSelected] = useState<string[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const clearSelection = () => {
    setSelected([]);
    setAllMatching(false);
  };
  const setFilters = (patch: Partial<Filters>, history: 'push' | 'replace' = 'push') => {
    const next = { ...filters, ...patch };
    // A stage or a question only means something inside its job.
    if ('jobId' in patch && patch.jobId !== filters.jobId) {
      next.stageId = null;
      next.questionId = null;
      next.answers = [];
    }
    const { status: _status, hasApplications: _segment, poolId: _pool, ...rest } = next;
    void setUrl({ ...rest, page: null, edited: view ? true : null }, { history });
    clearSelection();
  };
  const setPage = (value: number) => void setUrl({ page: value });
  const anyFilter = !sameFilters(filters, segmentBlank);
  const customFields = useCustomFields(canManage);
  const fieldLabels = Object.fromEntries(
    (customFields.data ?? []).map((field) => [field.key, field.label]),
  );

  // A deleted view sends you back here (once, though dev mode runs effects twice).
  const toldMissing = useRef(false);
  useEffect(() => {
    if (searchParams.get('missingView') && !toldMissing.current) {
      toldMissing.current = true;
      toast('That view was deleted', 'Here is everyone instead.');
      router.replace('/candidates');
    }
  }, [searchParams, router]);

  // ---- Search box: typing waits a moment before it changes the address bar ----
  const [searchText, setSearchText] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch }, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  useEffect(() => {
    // Changed from outside (a chip, Clear all, Back): show it in the box.
    if (filters.search !== debouncedSearch) setSearchText(filters.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  // ---- Ask AI ----
  const [aiMode, setAiMode] = useState(Boolean(initialDescribe || url.ask));
  const [describe, setDescribe] = useState(initialDescribe || url.ask);
  const [aiUndo, setAiUndo] = useState<{ describe: string; before: Filters } | null>(null);
  const toFilters = useMutation({
    mutationFn: () => api.post<AiFilters>('/api/ai/search-filters', { query: describe }),
    onSuccess: (result) => {
      setAiUndo({ describe: describe.trim(), before: filters });
      setFilters({
        search: result.q ?? '',
        skills: result.skills ?? [],
        skillMode: result.skillMode ?? 'any',
        title: result.title ?? '',
        location: result.location ?? '',
        minYears: result.minYears ?? null,
        seniority: result.seniority ?? null,
        minDegree: result.minDegree ?? null,
        company: result.company ?? '',
        school: result.school ?? '',
        excludeSkills: result.excludeSkills ?? [],
        minSkillYears: result.minSkillYears ?? null,
        country: result.country ?? '',
        region: result.region ?? '',
        city: result.city ?? '',
        openToRemote: result.openToRemote ?? false,
        willingToRelocate: result.willingToRelocate ?? false,
        minManagementYears: result.minManagementYears ?? null,
        field: result.field ?? null,
        employmentType: result.employmentType ?? null,
        language: result.language ?? '',
        languageLevel: result.languageLevel ?? null,
        certification: result.certification ?? '',
        tags: result.tags ?? [],
        source: result.source ?? null,
        minRating: result.minRating ? String(result.minRating) : null,
        idleDays: result.idleDays ?? null,
        sort: result.sort ?? filters.sort,
      });
    },
    onError: (error: Error) => toast.error('AI could not set the filters', error.message),
  });
  const runAsk = () => {
    const text = describe.trim();
    const job = rankJobId ?? filters.jobId;
    if (job) void setUrl({ find: job, ask: text || null, page: null });
    else if (text) toFilters.mutate();
  };

  // ---- Data ----
  const jobs = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  const job = useQuery({
    queryKey: ['requisition', filters.jobId],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${filters.jobId}`),
    enabled: Boolean(filters.jobId),
  });
  // Moving and rejecting need the job itself in your hands, not only the right to hire.
  const managesJob = (id?: string | null) => {
    const row = id === filters.jobId ? job.data : jobs.data?.find((item) => item.id === id);
    return Boolean(row) && ability.can('update', asJob(row!));
  };
  const params = candidateParams(filters, page).toString();
  const [initialQuery] = useState(params);
  const list = useQuery({
    queryKey: ['candidates', params],
    queryFn: () => api.get<CandidateListPage>(`/api/candidates?${params}`),
    initialData: params === initialQuery ? initialData : undefined,
    placeholderData: (previous) => previous,
    enabled: !rankJobId,
  });
  const [includeDismissed, setIncludeDismissed] = useState(false);
  // Ranked view only: hide low matches, and order by something other than the match number.
  const [minScore, setMinScore] = useState<string | null>(null);
  const [rankSort, setRankSort] = useState<string | null>(null);
  // Every list filter narrows who is ranked; the job being ranked for is not one of them.
  const rankFilter = candidateParams({ ...filters, jobId: null, stageId: null, minRating: null });
  for (const key of ['page', 'pageSize', 'sort']) rankFilter.delete(key);
  const rankFilterText = rankFilter.toString();
  const rank = useQuery({
    queryKey: [
      'talent-rank',
      rankJobId,
      url.ask,
      rankFilterText,
      includeDismissed,
      minScore,
      rankSort,
      page,
    ],
    enabled: Boolean(rankJobId),
    placeholderData: (previous) => previous,
    queryFn: () =>
      api.post<RankResponse>('/api/talent/rank', {
        requisitionId: rankJobId,
        query: url.ask || null,
        filter: rankFilterText,
        includeDismissed,
        minScore: minScore ? Number(minScore) : null,
        sort: rankSort,
        page,
        pageSize: 25,
      }),
  });

  // ---- Actions ----
  const [targetStage, setTargetStage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    kind: DialogKind;
    target: BulkTarget;
    count: number;
    name?: string;
  } | null>(null);
  const [rejecting, setRejecting] = useState<{
    id: string;
    name: string;
    app: CandidateListApplication;
  } | null>(null);
  const [fitFor, setFitFor] = useState<{ id: string; name: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const closeDialog = () => setDialog(null);
  const [emailPool, setEmailPool] = useState(false);
  const bulk = useBulkCandidates(() => {
    clearSelection();
    setTargetStage(null);
    setRejecting(null);
    closeDialog();
  });
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['talent-rank'] });
  };
  // "Check fit for the top 25" queues AI checks; the ranking refreshes while they run.
  const fitWaiting = useQuery({
    queryKey: ['fit-batch', rankJobId],
    queryFn: () => api.get<{ waiting: number }>(`/api/requisitions/${rankJobId}/fit/batch`),
    enabled: Boolean(rankJobId) && aiOn,
    refetchInterval: (query) => (query.state.data?.waiting ? 4_000 : false),
  });
  const waitingFits = fitWaiting.data?.waiting ?? 0;
  useEffect(() => {
    if (rankJobId) queryClient.invalidateQueries({ queryKey: ['talent-rank', rankJobId] });
  }, [waitingFits, rankJobId, queryClient]);
  const checkTop = useMutation({
    mutationFn: () =>
      api.post<{ queued: number; skipped: number }>(`/api/requisitions/${rankJobId}/fit/batch`, {
        candidateIds: (rank.data?.topIds ?? []).slice(0, 25),
      }),
    onSuccess: (result) => {
      fitWaiting.refetch();
      toast.success(
        result.queued
          ? `Checking ${result.queued === 1 ? '1 person' : `${result.queued} people`}`
          : 'Everyone at the top is checked already',
        result.queued ? 'Each fit shows in the match details when it is done.' : undefined,
      );
    },
    onError: (error: Error) => toast.error('Could not start the checks', error.message),
  });
  const undoDismiss = useMutation({
    mutationFn: (candidateId: string) =>
      api.delete(`/api/requisitions/${rankJobId}/dismissals/${candidateId}`),
    onSuccess: refreshAll,
    onError: (error: Error) => toast.error(error.message),
  });

  // ---- Saved views (columns, row size and sort travel with the view) ----
  const [saveOpened, setSaveOpened] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [viewDialog, setViewDialog] = useState<'rename' | 'delete' | null>(null);
  const [renameText, setRenameText] = useState('');
  const savedLayout = view ? viewLayout(view.paramsJson) : null;
  const [layoutDraft, setLayoutDraft] = useState<ViewLayout | null>(null);
  useEffect(() => setLayoutDraft(null), [view?.paramsJson]);
  const currentLayout = layoutDraft ?? savedLayout;
  /** This browser's columns for the list, to start a new view from. */
  const browserLayout = (): ViewLayout | null => {
    try {
      return JSON.parse(localStorage.getItem('ats-table:candidates-v3') ?? 'null');
    } catch {
      return null;
    }
  };
  const refreshViews = () => {
    queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
    queryClient.invalidateQueries({ queryKey: ['candidates', 'counts'] });
  };
  const createView = useMutation({
    mutationFn: ({ name, shared }: { name: string; shared: boolean }) =>
      api.post<{ id: string }>('/api/saved-views', {
        area: 'talent',
        name,
        shared,
        paramsJson: viewParams(filters, aiUndo?.describe ?? '', currentLayout ?? browserLayout()),
      }),
    onSuccess: ({ id }) => {
      setSaveOpened(false);
      setSaveName('');
      setSaveShared(false);
      refreshViews();
      toast.success('View saved');
      router.push(`/candidates/views/${id}`);
    },
    onError: (error: Error) => toast.error('Could not save the view', error.message),
  });
  const updateView = useMutation({
    mutationFn: (body: { name?: string; shared?: boolean; paramsJson?: string }) =>
      api.put(`/api/saved-views/${view!.id}`, body),
    onSuccess: (_, body) => {
      refreshViews();
      router.refresh();
      setViewDialog(null);
      toast.success(
        body.name
          ? 'View renamed'
          : body.shared === true
            ? 'Shared with the team'
            : body.shared === false
              ? 'Only you see this view now'
              : 'View saved',
      );
    },
    onError: (error: Error) => toast.error('Could not change the view', error.message),
  });
  const saveViewChanges = () =>
    updateView.mutate({
      paramsJson: viewParams(filters, aiUndo?.describe ?? '', currentLayout),
    });
  const pinView = useMutation({
    mutationFn: (on: boolean) =>
      on
        ? api.put(`/api/saved-views/${view!.id}/pin`, {})
        : api.delete(`/api/saved-views/${view!.id}/pin`),
    onSuccess: (_, on) => {
      refreshViews();
      router.refresh();
      toast.success(on ? 'Pinned to the top of your views' : 'Unpinned');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteView = useMutation({
    mutationFn: () => api.delete(`/api/saved-views/${view!.id}`),
    onSuccess: () => {
      refreshViews();
      toast.success('View deleted');
      router.push('/candidates');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const viewChanged =
    Boolean(view?.mine) &&
    (!sameFilters(filters, baseFilters) ||
      (layoutDraft !== null && JSON.stringify(layoutDraft) !== JSON.stringify(savedLayout)));

  // ---- Talent pool ----
  const [poolDialog, setPoolDialog] = useState<'edit' | 'delete' | null>(null);
  const deletePool = useMutation({
    mutationFn: () => api.delete(`/api/talent-pools/${pool!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-pools'] });
      toast.success(`${pool!.name} was deleted`);
      router.push('/candidates/talent-pools');
    },
    onError: (error: Error) => toast.error('Could not delete the pool', error.message),
  });

  // ---- Rows ----
  const items = list.data?.items ?? [];
  const rankItems = rank.data?.items ?? [];
  const staleDays = list.data?.staleDays ?? 3;
  const people: PreviewPerson[] = rankJobId
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
  const preview = people.find((person) => person.id === previewId);
  const total = rankJobId ? (rank.data?.total ?? 0) : (list.data?.total ?? 0);
  const pageSize = rankJobId ? (rank.data?.pageSize ?? 25) : (list.data?.pageSize ?? 25);

  const jobOptions = jobs.data?.map((item) => ({ value: item.id, label: item.title })) ?? [];
  const stageOptions = filters.jobId
    ? (job.data?.stages.map((stage) => ({ value: stage.id, label: stage.name })) ?? [])
    : [];
  const rankJobTitle = jobs.data?.find((item) => item.id === rankJobId)?.title;
  const jobTitle = jobs.data?.find((item) => item.id === filters.jobId)?.title;
  const sources = useSources(canManage);
  const questions = useQuery({
    queryKey: ['requisition-questions', filters.jobId],
    queryFn: () => api.get<Question[]>(`/api/requisitions/${filters.jobId}/questions`),
    enabled: Boolean(filters.jobId),
    staleTime: 60_000,
  });
  // Answers to filter on: questions with fixed choices (yes or no, one or several choices).
  const choiceQuestions = (questions.data ?? []).filter((q) => q.options.length > 0);
  const question = choiceQuestions.find((q) => q.id === filters.questionId);
  const chips = filterChips(
    filters,
    fieldLabels,
    question?.label ?? (filters.questionId ? 'Application answer' : undefined),
  );
  const tagOptions = useTagOptions(canManage);

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
  const one = (person: {
    id: string;
    name: string;
  }): { target: BulkTarget; count: number; name: string } => ({
    target: { ids: [person.id] },
    count: 1,
    name: person.name,
  });

  // ---- Filters popover ----
  const moreCount = chips.length;
  const label = (text: string) => <p className="mb-1.5 text-xs text-fg-subtle">{text}</p>;
  const filtersPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" leftIcon={<SlidersHorizontal />}>
          Filters
          {moreCount > 0 && <CountBadge count={moreCount} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,640px)] w-[min(92vw,520px)] overflow-y-auto"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TagsInput
              label="Skills on the resume"
              placeholder="Type a skill and press Enter"
              value={filters.skills}
              onChange={(value) => setFilters({ skills: value.map((item) => item.toLowerCase()) })}
            />
            {filters.skills.length > 1 && (
              <SegmentedControl
                className="mt-2"
                size="sm"
                aria-label="Skill match"
                value={filters.skillMode}
                onValueChange={(value) => setFilters({ skillMode: value })}
                items={[
                  { value: 'any', label: 'Any of them' },
                  { value: 'all', label: 'All of them' },
                ]}
              />
            )}
          </div>
          {filters.skills.length > 0 && (
            <NumberInput
              label="Years each skill has been used"
              min={0}
              max={30}
              value={filters.minSkillYears ?? ''}
              onValueChange={(value) => setFilters({ minSkillYears: value === '' ? null : value })}
            />
          )}
          <TagsInput
            className="sm:col-span-2"
            label="Leave out these skills"
            placeholder="Type a skill and press Enter"
            value={filters.excludeSkills}
            onChange={(value) =>
              setFilters({ excludeSkills: value.map((item) => item.toLowerCase()) })
            }
          />
          {canManage && (
            <TagsInput
              className="sm:col-span-2"
              label="Tags"
              placeholder="Choose tags"
              data={tagOptions.data?.map((item) => item.tag) ?? []}
              value={filters.tags}
              onChange={(value) => setFilters({ tags: value.map((item) => item.toLowerCase()) })}
            />
          )}
          {canManage && (
            <TagsInput
              className="sm:col-span-2"
              label="Leave out these tags"
              placeholder="Choose tags"
              data={tagOptions.data?.map((item) => item.tag) ?? []}
              value={filters.excludeTags}
              onChange={(value) =>
                setFilters({ excludeTags: value.map((item) => item.toLowerCase()) })
              }
            />
          )}
          <Input
            label="Job title"
            defaultValue={filters.title}
            key={`title-${filters.title}`}
            onBlur={(event) => setFilters({ title: event.currentTarget.value.trim() })}
            onKeyDown={(event) =>
              event.key === 'Enter' && setFilters({ title: event.currentTarget.value.trim() })
            }
          />
          <Input
            label="Location"
            defaultValue={filters.location}
            key={`location-${filters.location}`}
            onBlur={(event) => setFilters({ location: event.currentTarget.value.trim() })}
            onKeyDown={(event) =>
              event.key === 'Enter' && setFilters({ location: event.currentTarget.value.trim() })
            }
          />
          <NumberInput
            label="Minimum years of experience"
            min={0}
            max={50}
            value={filters.minYears ?? ''}
            onValueChange={(value) => setFilters({ minYears: value === '' ? null : value })}
          />
          <Select
            label="Minimum seniority"
            clearable
            placeholder="Any seniority"
            data={SENIORITY_OPTIONS}
            value={filters.seniority}
            onChange={(value) => setFilters({ seniority: value })}
          />
          <Select
            label="Minimum degree"
            clearable
            placeholder="Any degree"
            data={DEGREE_OPTIONS}
            value={filters.minDegree}
            onChange={(value) => setFilters({ minDegree: value })}
          />
          <Select
            label="Source"
            clearable
            placeholder="Any source"
            data={sourceOptions(sources.data, filters.source)}
            value={filters.source}
            onChange={(value) => setFilters({ source: value })}
          />
          <Input
            label="Worked at"
            defaultValue={filters.company}
            key={`company-${filters.company}`}
            onBlur={(event) => setFilters({ company: event.currentTarget.value.trim() })}
            onKeyDown={(event) =>
              event.key === 'Enter' && setFilters({ company: event.currentTarget.value.trim() })
            }
          />
          <Input
            label="Studied at"
            defaultValue={filters.school}
            key={`school-${filters.school}`}
            onBlur={(event) => setFilters({ school: event.currentTarget.value.trim() })}
            onKeyDown={(event) =>
              event.key === 'Enter' && setFilters({ school: event.currentTarget.value.trim() })
            }
          />
          <div>
            {label('Minimum rating')}
            <SegmentedControl
              size="sm"
              aria-label="Minimum rating"
              value={filters.minRating ?? 'any'}
              onValueChange={(value) => setFilters({ minRating: value === 'any' ? null : value })}
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
              onValueChange={(value) => setFilters({ hasResume: value === 'any' ? null : value })}
              items={[
                { value: 'any', label: 'Any' },
                { value: 'true', label: 'Read' },
                { value: 'false', label: 'Not yet' },
              ]}
            />
          </div>
          {(customFields.data ?? []).filter(hasOptions).map((field) => {
            const picked = customFilters(filters.custom)[field.key] ?? [];
            return (
              <MultiSelect
                key={field.key}
                className="sm:col-span-2"
                label={field.label}
                placeholder="Any"
                data={field.options}
                value={picked}
                onChange={(values) =>
                  setFilters({
                    custom: [
                      ...filters.custom.filter((pair) => !pair.startsWith(`${field.key}=`)),
                      ...values.map((value) => `${field.key}=${value}`),
                    ],
                  })
                }
              />
            );
          })}
          <section
            aria-label="Where they are"
            className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:col-span-2"
          >
            <p className="text-sm font-medium text-fg">Where they are</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextFilter
                label="City"
                value={filters.city}
                onCommit={(city) => setFilters({ city })}
              />
              <TextFilter
                label="State or region"
                value={filters.region}
                onCommit={(region) => setFilters({ region })}
              />
              <TextFilter
                label="Country"
                value={filters.country}
                onCommit={(country) => setFilters({ country })}
              />
            </div>
            <Checkbox
              label="Open to remote work"
              checked={filters.openToRemote}
              onCheckedChange={(checked) => setFilters({ openToRemote: checked })}
            />
            <Checkbox
              label="Willing to relocate"
              checked={filters.willingToRelocate}
              onCheckedChange={(checked) => setFilters({ willingToRelocate: checked })}
            />
          </section>
          <section
            aria-label="More from the resume"
            className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:col-span-2"
          >
            <p className="text-sm font-medium text-fg">More from the resume</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextFilter
                label="Certification or issuer"
                value={filters.certification}
                onCommit={(certification) => setFilters({ certification })}
              />
              <Select
                label="Studied"
                clearable
                placeholder="Any field"
                data={asOptions(FIELD_LABELS)}
                value={filters.field}
                onChange={(value) => setFilters({ field: value })}
              />
              <TextFilter
                label="Speaks"
                value={filters.language}
                onCommit={(language) => setFilters({ language })}
              />
              <Select
                label="Language level"
                clearable
                placeholder="Any level"
                data={asOptions(LANGUAGE_LEVEL_LABELS)}
                value={filters.languageLevel}
                onChange={(value) => setFilters({ languageLevel: value })}
              />
              <Select
                label="Has worked as"
                clearable
                placeholder="Any kind of work"
                data={asOptions(EMPLOYMENT_LABELS)}
                value={filters.employmentType}
                onChange={(value) => setFilters({ employmentType: value })}
              />
              <NumberInput
                label="Years managing people"
                min={0}
                max={40}
                value={filters.minManagementYears ?? ''}
                onValueChange={(value) =>
                  setFilters({ minManagementYears: value === '' ? null : value })
                }
              />
            </div>
          </section>
          <section
            aria-label="Their applications"
            className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:col-span-2"
          >
            <p className="text-sm font-medium text-fg">Their applications</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="date"
                label="Applied from"
                value={filters.appliedFrom ?? ''}
                onChange={(event) => setFilters({ appliedFrom: event.currentTarget.value || null })}
              />
              <Input
                type="date"
                label="Applied until"
                value={filters.appliedTo ?? ''}
                onChange={(event) => setFilters({ appliedTo: event.currentTarget.value || null })}
              />
              <Input
                type="date"
                label="Last active from"
                value={filters.activityFrom ?? ''}
                onChange={(event) =>
                  setFilters({ activityFrom: event.currentTarget.value || null })
                }
              />
              <Input
                type="date"
                label="Last active until"
                value={filters.activityTo ?? ''}
                onChange={(event) => setFilters({ activityTo: event.currentTarget.value || null })}
              />
              <Select
                label="No activity for"
                clearable
                placeholder="Any"
                data={IDLE_OPTIONS}
                value={filters.idleDays === null ? null : String(filters.idleDays)}
                onChange={(value) => setFilters({ idleDays: value ? Number(value) : null })}
              />
              <Select
                label="AI fit check"
                clearable
                placeholder="Any"
                data={FIT_OPTIONS}
                value={filters.minFit === null ? null : String(filters.minFit)}
                onChange={(value) => setFilters({ minFit: value ? Number(value) : null })}
              />
              <Select
                label="Applied through"
                clearable
                placeholder="Any source"
                data={sourceOptions(sources.data, filters.applicationSource)}
                value={filters.applicationSource}
                onChange={(value) => setFilters({ applicationSource: value })}
              />
              <TextFilter
                label="Assigned to (email)"
                value={filters.assignee ?? ''}
                onCommit={(assignee) => setFilters({ assignee: assignee || null })}
              />
              <TextFilter
                label="Reason it ended"
                value={filters.reason ?? ''}
                onCommit={(reason) => setFilters({ reason: reason || null })}
              />
            </div>
            <Checkbox
              label="Has unread messages"
              checked={filters.unread}
              onCheckedChange={(checked) => setFilters({ unread: checked })}
            />
            <Checkbox
              label="Waiting on interview feedback"
              checked={filters.feedbackOwed}
              onCheckedChange={(checked) => setFilters({ feedbackOwed: checked })}
            />
          </section>
          <section
            aria-label="When they were added"
            className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:col-span-2"
          >
            <p className="text-sm font-medium text-fg">When they were added</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="date"
                label="Added from"
                value={filters.addedFrom ?? ''}
                onChange={(event) => setFilters({ addedFrom: event.currentTarget.value || null })}
              />
              <Input
                type="date"
                label="Added until"
                value={filters.addedTo ?? ''}
                onChange={(event) => setFilters({ addedTo: event.currentTarget.value || null })}
              />
            </div>
          </section>
          <section
            aria-label="Application answers"
            className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:col-span-2"
          >
            <p className="text-sm font-medium text-fg">Application answers</p>
            {!filters.jobId ? (
              <p className="text-xs text-fg-subtle">
                Choose a job in the toolbar to filter by the answers to its questions.
              </p>
            ) : choiceQuestions.length === 0 ? (
              <p className="text-xs text-fg-subtle">
                {questions.isPending
                  ? 'Loading the questions…'
                  : 'This job asks no questions with choices to filter by.'}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Question"
                  clearable
                  placeholder="Choose a question"
                  data={choiceQuestions.map((q) => ({ value: q.id, label: q.label }))}
                  value={filters.questionId}
                  onChange={(value) => setFilters({ questionId: value, answers: [] })}
                />
                <MultiSelect
                  label="Answer"
                  placeholder={question ? 'Any answer' : 'Choose a question first'}
                  disabled={!question}
                  data={question?.options ?? []}
                  value={filters.answers}
                  onChange={(answers) => setFilters({ answers })}
                />
              </div>
            )}
            <Checkbox
              label="Flagged answers only"
              description="Answers your questions mark for review, for example “No” to “Can you work in the US?”"
              checked={filters.flagged}
              onCheckedChange={(checked) => setFilters({ flagged: checked })}
            />
          </section>
          <Checkbox
            className="sm:col-span-2"
            label="Include people marked do not contact"
            checked={filters.includeDnc}
            onCheckedChange={(checked) => setFilters({ includeDnc: checked })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );

  // ---- Search box with Ask AI ----
  const askPlaceholder =
    rankJobId || filters.jobId
      ? 'Describe who you need, then rank everyone on file for this job'
      : 'Describe who you need, for example senior React engineers in Chicago';
  const searchBox = (
    <Input
      aria-label={aiMode ? 'Describe who you need' : 'Search candidates'}
      placeholder={aiMode ? askPlaceholder : 'Search names, email, phone, skills or resumes'}
      type={aiMode ? 'text' : 'search'}
      role={aiMode ? undefined : 'searchbox'}
      value={aiMode ? describe : searchText}
      onChange={(event) =>
        aiMode ? setDescribe(event.currentTarget.value) : setSearchText(event.currentTarget.value)
      }
      onKeyDown={(event) => {
        if (aiMode && event.key === 'Enter') runAsk();
      }}
      className="min-w-0 basis-full sm:w-auto sm:min-w-[180px] sm:flex-1 sm:basis-0"
      inputClassName="[&::-webkit-search-cancel-button]:hidden"
      leftSection={aiMode ? <Sparkles className="text-accent-foreground" /> : <Search />}
      rightSection={
        <span className="flex items-center gap-1">
          {toFilters.isPending ? (
            <Spinner className="size-4" />
          ) : (
            (aiMode ? describe : searchText) && (
              <button
                type="button"
                aria-label={aiMode ? 'Clear the description' : 'Clear search'}
                onClick={() => (aiMode ? setDescribe('') : setSearchText(''))}
                className="rounded-sm p-0.5 hover:bg-secondary hover:text-fg"
              >
                <X />
              </button>
            )
          )}
          {aiMode && describe.trim() && !toFilters.isPending && (
            <button
              type="button"
              aria-label="Ask AI"
              onClick={runAsk}
              className="rounded-sm p-0.5 text-accent-foreground hover:bg-secondary"
            >
              <ArrowRight />
            </button>
          )}
          {aiOn && (
            <Tooltip label={aiMode ? 'Back to keyword search' : 'Ask AI: describe who you need'}>
              <button
                type="button"
                aria-label="Ask AI"
                aria-pressed={aiMode}
                onClick={() => setAiMode((on) => !on)}
                className={cn(
                  'ml-0.5 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                  aiMode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-fg-muted hover:bg-secondary hover:text-fg',
                )}
              >
                <Sparkles className="size-3.5!" aria-hidden />
                <span className="hidden md:inline">Ask AI</span>
              </button>
            </Tooltip>
          )}
        </span>
      }
    />
  );

  const toolbar = (
    <>
      {searchBox}
      {!rankJobId && (
        <FilterSelect
          aria-label="Job"
          allLabel="All jobs"
          data={jobOptions}
          value={filters.jobId}
          onChange={(value) => setFilters({ jobId: value })}
          className="max-w-[220px] [&>span]:truncate"
        />
      )}
      {filters.jobId && !rankJobId && (
        <FilterSelect
          aria-label="Stage"
          allLabel="All stages"
          data={stageOptions}
          value={filters.stageId}
          onChange={(value) => setFilters({ stageId: value })}
        />
      )}
      {!filters.jobId && !rankJobId && (
        <FilterSelect
          aria-label="Stage type"
          allLabel="All stages"
          data={STAGE_TYPES.map((type) => ({ value: type, label: STAGE_TYPE_LABELS[type] }))}
          value={filters.stageType}
          onChange={(value) => setFilters({ stageType: value })}
        />
      )}
      {!rankJobId && (
        <FilterSelect
          aria-label="Sort"
          allLabel={SORT_OPTIONS[0].label}
          data={[
            ...(pool ? [{ value: 'added', label: 'Added to the pool' }] : []),
            ...SORT_OPTIONS.slice(1),
          ]}
          value={filters.sort === SORT_OPTIONS[0].value ? null : filters.sort}
          onChange={(value) => setFilters({ sort: value ?? SORT_OPTIONS[0].value })}
        />
      )}
      {filtersPopover}
    </>
  );

  // ---- Chips and context under the toolbar ----
  const chipButton =
    'inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1.5 text-xs text-fg hover:border-fg-subtle';
  const subToolbar = (rankJobId ||
    chips.length > 0 ||
    aiUndo ||
    (filters.jobId && staff && managesJob(filters.jobId)) ||
    viewChanged) && (
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2">
      {rankJobId && (
        <>
          <p className="text-sm font-medium text-fg">
            Everyone on file, ranked for {rankJobTitle ?? 'this job'}
            {url.ask && <span className="font-normal text-fg-muted"> · “{url.ask}”</span>}
          </p>
          <Checkbox
            label={`Show dismissed${rank.data?.dismissed ? ` (${rank.data.dismissed})` : ''}`}
            checked={includeDismissed}
            onCheckedChange={setIncludeDismissed}
          />
          <FilterSelect
            aria-label="Minimum match"
            allLabel="Any match"
            data={['40', '50', '60', '70', '80'].map((value) => ({
              value,
              label: `${value}% or more`,
            }))}
            value={minScore}
            onChange={(value) => {
              setMinScore(value);
              void setUrl({ page: null });
            }}
          />
          <FilterSelect
            aria-label="Order ranked people by"
            allLabel="Best match first"
            data={[
              { value: 'experience', label: 'Most experience first' },
              { value: 'fit', label: 'Best AI fit first' },
            ]}
            value={rankSort}
            onChange={(value) => {
              setRankSort(value);
              void setUrl({ page: null });
            }}
          />
          {aiOn && rank.data && !rank.data.note?.startsWith('Confirm') && (
            <Button
              variant="soft"
              size="sm"
              leftIcon={waitingFits ? <Spinner className="size-3.5" /> : <Sparkles />}
              disabled={waitingFits > 0}
              loading={checkTop.isPending}
              onClick={() => checkTop.mutate()}
            >
              {waitingFits ? `Checking fit: ${waitingFits} left` : 'Check fit for the top 25'}
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            leftIcon={<ArrowLeft />}
            onClick={() => void setUrl({ find: null, ask: null, page: null })}
          >
            Show the list again
          </Button>
        </>
      )}
      {!rankJobId && filters.jobId && staff && managesJob(filters.jobId) && (
        <Button
          variant="soft"
          size="sm"
          leftIcon={<UserSearch />}
          onClick={() => void setUrl({ find: filters.jobId, page: null })}
        >
          Find more people for {jobTitle ?? 'this job'}
        </Button>
      )}
      {chips.map((chip) => (
        <span key={chip.key} className={chipButton}>
          {chip.label}
          <button
            type="button"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={() => setFilters(clearChip(chip.key, filters))}
            className="rounded-full p-0.5 text-fg-subtle hover:bg-secondary hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {aiUndo && (
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
          <Sparkles className="size-3.5 text-accent-foreground" aria-hidden />
          AI set these from “{aiUndo.describe}”
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setFilters(aiUndo.before);
              setAiUndo(null);
            }}
          >
            Undo
          </Button>
        </span>
      )}
      {chips.length > 0 && (
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setFilters({
              ...segmentBlank,
              jobId: filters.jobId,
              stageId: filters.stageId,
              sort: filters.sort,
              search: filters.search,
            });
            setAiUndo(null);
          }}
        >
          Clear filters
        </Button>
      )}
      <span className="ml-auto flex items-center gap-2">
        {view && viewChanged && (
          <Button
            size="sm"
            variant="secondary"
            loading={updateView.isPending}
            onClick={saveViewChanges}
          >
            Save changes to “{view.name}”
          </Button>
        )}
        {canManage && !view && anyFilter && (
          <Popover open={saveOpened} onOpenChange={setSaveOpened}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary">
                Save as a view
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (saveName.trim())
                    createView.mutate({ name: saveName.trim(), shared: saveShared });
                }}
              >
                <Input
                  label="Name"
                  placeholder="For example, Chicago React leads"
                  value={saveName}
                  onChange={(event) => setSaveName(event.currentTarget.value)}
                  autoFocus
                />
                <Checkbox
                  label="Share with the team"
                  checked={saveShared}
                  onCheckedChange={setSaveShared}
                />
                <p className="text-xs text-fg-subtle">
                  The view keeps these filters and your columns.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!saveName.trim()}
                  loading={createView.isPending}
                >
                  Save view
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        )}
      </span>
    </div>
  );

  // ---- Columns ----
  const rankColumns: Column<RankedCandidate>[] = [
    {
      id: 'score',
      header: 'Match',
      align: 'right',
      className: 'w-[84px]',
      cell: (item) => (
        <MatchCell
          item={item}
          aiOn={aiOn}
          onWhy={() => setFitFor({ id: item.candidateId, name: item.name })}
        />
      ),
      csv: (item) => Math.round(item.score),
      hideable: false,
    },
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      className: 'max-w-[280px]',
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
      className: 'w-[130px] whitespace-nowrap',
      cell: (item) =>
        item.dismissed ? (
          <span className="text-fg-subtle">Dismissed</span>
        ) : item.appliedToJob ? (
          <Badge tone="blue">In this job</Badge>
        ) : (
          <span className="text-fg-subtle">Not yet</span>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      align: 'right',
      className: 'w-14',
      hideable: false,
      sticky: true,
      cell: (item) => (
        <div onClick={stop}>
          <RowActions label={`Actions for ${item.name}`}>
            {!item.appliedToJob && !item.dismissed && (
              <MenuItem
                icon={<UserPlus />}
                onSelect={() =>
                  bulk.mutate({
                    ids: [item.candidateId],
                    action: 'addToJob',
                    requisitionId: rankJobId,
                  })
                }
              >
                Add to this job
              </MenuItem>
            )}
            {user.aiEnabled && (
              <MenuItem
                icon={<Sparkles />}
                onSelect={() => setFitFor({ id: item.candidateId, name: item.name })}
              >
                Why they rank here
              </MenuItem>
            )}
            <MenuItem onSelect={() => router.push(`/candidates/${item.candidateId}`)}>
              Open profile
            </MenuItem>
            <MenuItem onSelect={() => copyEmail(item.email)}>Copy email</MenuItem>
            <MenuSeparator />
            {item.dismissed ? (
              <MenuItem onSelect={() => undoDismiss.mutate(item.candidateId)}>Bring back</MenuItem>
            ) : (
              <MenuItem
                danger
                icon={<EyeOff />}
                onSelect={() =>
                  setDialog({ kind: 'dismiss', ...one({ id: item.candidateId, name: item.name }) })
                }
              >
                Not a fit for this job…
              </MenuItem>
            )}
          </RowActions>
        </div>
      ),
    },
  ];

  const listColumns: Column<CandidateListItem>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      className: 'max-w-[300px]',
      cell: (person) => (
        <div className="flex min-w-0 items-center gap-3" data-row-id={person.id}>
          <Avatar name={person.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-fg">
              <span className="truncate">{person.name}</span>
              {person.doNotContact && (
                <Badge tone="red" size="sm">
                  Do not contact
                </Badge>
              )}
            </div>
            {person.snippet ? (
              <Snippet text={person.snippet} />
            ) : (
              <div className="mt-0.5 truncate text-xs text-fg-subtle">{person.email}</div>
            )}
          </div>
        </div>
      ),
      csv: (person) => person.name,
    },
    // With a job chosen every row is in it, so the column would only repeat the filter.
    ...(filters.jobId
      ? []
      : [
          {
            id: 'job',
            header: 'Applied for',
            className: 'max-w-[220px]',
            cell: (person: CandidateListItem) => {
              const app = shownApp(person, filters);
              if (!app) return <span className="text-fg-subtle">–</span>;
              return (
                <CellStack
                  primary={app.requisitionTitle}
                  secondary={[
                    app.requisitionCode,
                    person.applications.length > 1
                      ? `+${person.applications.length - 1} more`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              );
            },
          },
        ]),
    {
      id: 'stage',
      header: 'Stage',
      cell: (person) => <StageCell app={shownApp(person, filters)} staleDays={staleDays} />,
    },
    // In a pool: who added each person, and when.
    ...(pool
      ? [
          {
            id: 'added',
            header: 'Added to the pool',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (person: CandidateListItem) => {
              const added = (person as CandidateListItem & PoolInfo).pool;
              return added ? (
                <CellStack
                  primary={formatDate(added.addedAt)}
                  secondary={`by ${added.addedByName}`}
                />
              ) : (
                '–'
              );
            },
          },
        ]
      : []),
    // Custom fields: in the column picker, hidden until someone turns them on.
    ...(customFields.data ?? []).map((field) => ({
      id: `cf-${field.key}`,
      header: field.label,
      defaultHidden: true,
      className: 'max-w-[200px]',
      cell: (person: CandidateListItem) => {
        const value = (person as CandidateListItem & CustomFieldsRow).customFields?.[field.key];
        return value ? (
          <span className="block truncate text-fg-muted">
            {field.type === 'date' ? formatDate(value) : value}
          </span>
        ) : (
          <span className="text-fg-subtle">–</span>
        );
      },
    })),
    {
      id: 'tags',
      header: 'Tags',
      className: 'max-w-[180px]',
      defaultHidden: true,
      cell: (person) =>
        person.tags?.length ? (
          <span className="block truncate text-fg-muted">{person.tags.join(', ')}</span>
        ) : (
          <span className="text-fg-subtle">–</span>
        ),
    },
    {
      id: 'source',
      header: 'Source',
      defaultHidden: true,
      className: 'whitespace-nowrap text-fg-muted',
      cell: (person) => person.source,
    },
    {
      id: 'activity',
      header: 'Last active',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (person) => {
        const app = shownApp(person, filters);
        return (
          <span
            title={
              app ? `Applied ${formatDate(app.appliedAt)}` : `Added ${formatDate(person.createdAt)}`
            }
          >
            {formatRelative(app?.lastActivityAt ?? person.updatedAt)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      align: 'right',
      className: 'w-14',
      hideable: false,
      sticky: true,
      cell: (person) => {
        const app = shownApp(person, filters);
        const restricted = person.email === 'Restricted';
        return (
          <div onClick={stop}>
            <RowActions label={`Actions for ${person.name}`}>
              <MenuItem onSelect={() => router.push(`/candidates/${person.id}`)}>
                Open profile
              </MenuItem>
              {person.applications.length === 1 && (
                <MenuItem
                  onSelect={() => router.push(`/applications/${person.applications[0].id}`)}
                >
                  Open application
                </MenuItem>
              )}
              {person.applications.length > 1 && (
                <MenuSub>
                  <MenuSubTrigger>Open an application</MenuSubTrigger>
                  <MenuSubContent>
                    {person.applications.map((item) => (
                      <MenuItem
                        key={item.id}
                        onSelect={() => router.push(`/applications/${item.id}`)}
                      >
                        {item.requisitionTitle}
                      </MenuItem>
                    ))}
                  </MenuSubContent>
                </MenuSub>
              )}
              {canManage && (
                <MenuItem
                  icon={<Briefcase />}
                  onSelect={() => setDialog({ kind: 'job', ...one(person) })}
                >
                  Add to a job…
                </MenuItem>
              )}
              {staff && (
                <MenuItem
                  icon={<Tags />}
                  onSelect={() => setDialog({ kind: 'tags', ...one(person) })}
                >
                  Change tags…
                </MenuItem>
              )}
              {staff && (
                <MenuItem
                  icon={<Layers />}
                  onSelect={() => setDialog({ kind: 'pool', ...one(person) })}
                >
                  Add to a pool…
                </MenuItem>
              )}
              {staff && pool && (
                <MenuItem
                  icon={<CircleMinus />}
                  onSelect={() =>
                    bulk.mutate({ ids: [person.id], action: 'removeFromPool', poolId: pool.id })
                  }
                >
                  Remove from this pool
                </MenuItem>
              )}
              {staff &&
                (person.doNotContact ? (
                  <MenuItem
                    icon={<MailX />}
                    onSelect={() => bulk.mutate({ ids: [person.id], action: 'allowContact' })}
                  >
                    Allow contact again
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<MailX />}
                    onSelect={() => setDialog({ kind: 'dnc', ...one(person) })}
                  >
                    Mark do not contact…
                  </MenuItem>
                ))}
              {!restricted && (
                <MenuItem onSelect={() => copyEmail(person.email)}>Copy email</MenuItem>
              )}
              {app?.status === 'Active' && managesJob(app.requisitionId) && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    onSelect={() => setRejecting({ id: person.id, name: person.name, app })}
                  >
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

  /** Phones: one stacked row per person (name, job and stage). */
  const card = (person: CandidateListItem) => {
    const app = shownApp(person, filters);
    return (
      <div className="flex items-start gap-3" data-row-id={person.id}>
        <Avatar name={person.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-fg">{person.name}</p>
          <p className="truncate text-xs text-fg-subtle">
            {app ? app.requisitionTitle : person.currentTitle || person.email}
          </p>
        </div>
        {app &&
          (app.status === 'Active' ? (
            <StageBadge stage={app.stage} type={app.stageType} color={app.stageColor} size="sm" />
          ) : (
            <StatusBadge status={app.status} size="sm" />
          ))}
      </div>
    );
  };

  // ---- Bulk actions ----
  const pageIds = rankJobId
    ? rankItems.map((item) => item.candidateId)
    : items.map((item) => item.id);
  const wholePageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const target: BulkTarget = allMatching
    ? { filter: candidateParams(filters).toString() }
    : { ids: selected };
  const count = allMatching ? total : selected.length;
  const openBulk = (kind: DialogKind) => setDialog({ kind, target, count });
  const exportUrl = (extra?: string) =>
    `/api/candidates/export?${candidateParams(filters).toString()}${extra ?? ''}`;
  const download = (href: string) => {
    window.location.assign(href);
    toast('Preparing your spreadsheet', 'It downloads in a moment.');
  };
  const canBulkJob = Boolean(filters.jobId) && !rankJobId && managesJob(filters.jobId);
  const bulkActions = rankJobId ? (
    <>
      <Button
        size="sm"
        leftIcon={<UserPlus />}
        loading={bulk.isPending}
        onClick={() => bulk.mutate({ ids: selected, action: 'addToJob', requisitionId: rankJobId })}
      >
        Add to this job
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<EyeOff />}
        onClick={() =>
          setDialog({ kind: 'dismiss', target: { ids: selected }, count: selected.length })
        }
      >
        Not a fit
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Layers />}
        onClick={() =>
          setDialog({ kind: 'pool', target: { ids: selected }, count: selected.length })
        }
      >
        Add to a pool
      </Button>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<GitCompareArrows />}
        disabled={selected.length < 2 || selected.length > 4}
        title={selected.length > 4 ? 'Compare up to four people' : undefined}
        onClick={() =>
          router.push(`/candidates/compare?ids=${selected.join(',')}&job=${rankJobId}`)
        }
      >
        Compare
      </Button>
    </>
  ) : (
    <>
      {!allMatching && wholePageSelected && total > pageIds.length && (
        <Button variant="link" size="sm" onClick={() => setAllMatching(true)}>
          Select all {total.toLocaleString()} matching
        </Button>
      )}
      {!allMatching && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<GitCompareArrows />}
          disabled={selected.length < 2 || selected.length > 4}
          title={selected.length > 4 ? 'Compare up to four people' : undefined}
          onClick={() =>
            router.push(
              `/candidates/compare?ids=${selected.join(',')}${filters.jobId ? `&job=${filters.jobId}` : ''}`,
            )
          }
        >
          Compare
        </Button>
      )}
      {canEmail && (
        <Button size="sm" variant="secondary" leftIcon={<Mail />} onClick={() => openBulk('email')}>
          Email
        </Button>
      )}
      {canBulkJob && (
        <>
          <Select
            size="sm"
            aria-label="Move to stage"
            placeholder="Move to stage"
            value={targetStage}
            onChange={setTargetStage}
            data={stageOptions}
            className="w-44"
          />
          <Button
            size="sm"
            leftIcon={<UserCheck />}
            disabled={!targetStage}
            loading={bulk.isPending && bulk.variables?.action === 'move'}
            onClick={() =>
              bulk.mutate({
                ...target,
                action: 'move',
                requisitionId: filters.jobId,
                stageId: targetStage,
              })
            }
          >
            Move
          </Button>
          <Button
            size="sm"
            variant="danger-quiet"
            leftIcon={<UserX />}
            onClick={() => openBulk('reject')}
          >
            Reject
          </Button>
        </>
      )}
      {canManage && !canBulkJob && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Briefcase />}
          onClick={() => openBulk('job')}
        >
          Add to a job
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More actions" size="sm" variant="secondary">
            <MoreHorizontal />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          {canManage && canBulkJob && (
            <MenuItem icon={<Briefcase />} onSelect={() => openBulk('job')}>
              Add to another job…
            </MenuItem>
          )}
          {staff && (
            <MenuItem icon={<Tags />} onSelect={() => openBulk('tags')}>
              Add or remove tags…
            </MenuItem>
          )}
          {staff && (
            <MenuItem icon={<Layers />} onSelect={() => openBulk('pool')}>
              Add to a pool…
            </MenuItem>
          )}
          {staff && pool && (
            <MenuItem
              icon={<CircleMinus />}
              onSelect={() => bulk.mutate({ ...target, action: 'removeFromPool', poolId: pool.id })}
            >
              Remove from this pool
            </MenuItem>
          )}
          {staff && (
            <MenuItem icon={<MailX />} onSelect={() => openBulk('dnc')}>
              Mark do not contact…
            </MenuItem>
          )}
          <MenuItem
            onSelect={() =>
              allMatching
                ? download(exportUrl())
                : selected.length > 200
                  ? toast(
                      'Choose up to 200 people to export',
                      'Or select everyone matching and export that.',
                    )
                  : download(exportUrl(`&ids=${selected.join(',')}`))
            }
          >
            Export to a spreadsheet (CSV)
          </MenuItem>
          {ability.can('delete', 'Candidate') && (
            <>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => openBulk('delete')}>
                Delete…
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </>
  );

  const tableProps = {
    toolbar,
    subToolbar,
    selectable: true,
    selected,
    onSelectedChange: (ids: string[]) => {
      setSelected(ids);
      if (ids.length < selected.length) setAllMatching(false);
    },
    selectionCount: count,
    bulkActions,
    noun: 'candidate',
  };
  const listTable = (
    <DataTable
      {...tableProps}
      viewKey="candidates-v3"
      layout={view ? currentLayout : undefined}
      onLayoutChange={setLayoutDraft}
      data={items}
      columns={listColumns}
      getRowId={(person) => person.id}
      loading={!list.data}
      onRowOpen={(person) => openRow(person.id)}
      rowLabel={(person) => person.name}
      rowClassName={(person) => previewing(person.id)}
      pagination={{ page, pageSize, total, onPageChange: setPage }}
      onExport={() => download(exportUrl())}
      card={card}
      empty={
        <EmptyState
          icon={UserSearch}
          title={anyFilter ? 'Nobody matches these filters' : 'Nobody here yet'}
          description={anyFilter ? 'Try fewer filters, or a shorter search.' : undefined}
          action={
            anyFilter && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFilters(segmentBlank);
                  setSearchText('');
                }}
              >
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
        <Alert
          tone="warning"
          className="mt-3"
          action={
            rank.data.note.startsWith('Confirm') && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/jobs/${rankJobId}/requirements`}>Confirm requirements</Link>
              </Button>
            )
          }
        >
          {rank.data.note}
        </Alert>
      )}
      {!!rank.data?.pending && (
        <p className="mb-3 text-sm text-fg-subtle">
          {rank.data.pending === 1 ? '1 resume is' : `${rank.data.pending} resumes are`} still being
          read. They join the ranking when they are done.
        </p>
      )}
      <DataTable
        {...tableProps}
        selectionCount={selected.length}
        viewKey="candidates-rank"
        exportable={false}
        data={rankItems}
        columns={rankColumns}
        getRowId={(item) => item.candidateId}
        loading={!rank.data}
        onRowOpen={(item) => openRow(item.candidateId)}
        rowLabel={(item) => item.name}
        rowClassName={(item) =>
          [item.dismissed && 'opacity-55', previewing(item.candidateId)].filter(Boolean).join(' ')
        }
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        empty={<EmptyState icon={UserSearch} title="Nobody on file matches this job yet" />}
      />
    </>
  );

  return (
    <>
      {view && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-lg font-semibold text-fg">{view.name}</h2>
          {view.pinned && <Pin className="size-4 text-fg-subtle" aria-label="Pinned" />}
          <Badge size="sm" tone={view.shared ? 'blue' : 'gray'}>
            {view.shared
              ? view.mine
                ? 'Shared with the team'
                : `Shared by ${view.ownerName}`
              : 'Only you'}
          </Badge>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={`Actions for the view ${view.name}`} size="sm" variant="quiet">
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem
                icon={view.pinned ? <PinOff /> : <Pin />}
                onSelect={() => pinView.mutate(!view.pinned)}
              >
                {view.pinned ? 'Unpin' : 'Pin to the top'}
              </MenuItem>
              {view.mine && (
                <>
                  <MenuItem
                    icon={<Pencil />}
                    onSelect={() => {
                      setRenameText(view.name);
                      setViewDialog('rename');
                    }}
                  >
                    Rename…
                  </MenuItem>
                  <MenuItem
                    icon={view.shared ? <Lock /> : <Share2 />}
                    onSelect={() => updateView.mutate({ shared: !view.shared })}
                  >
                    {view.shared ? 'Make private' : 'Share with the team'}
                  </MenuItem>
                </>
              )}
              <MenuItem
                icon={<Copy />}
                onSelect={() => createView.mutate({ name: `${view.name} (copy)`, shared: false })}
              >
                {view.mine ? 'Duplicate' : 'Save a copy for me'}
              </MenuItem>
              {view.mine && (
                <>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 />} onSelect={() => setViewDialog('delete')}>
                    Delete view…
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      )}
      {pool && (
        <div className="mb-4 flex flex-wrap items-start gap-x-2 gap-y-1">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
              <Layers className="size-4 text-fg-subtle" aria-hidden />
              {pool.name}
            </h2>
            {pool.description && <p className="mt-0.5 text-sm text-fg-muted">{pool.description}</p>}
          </div>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label={`Actions for the pool ${pool.name}`} size="sm" variant="quiet">
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="start">
              {canEmail && (
                <MenuItem icon={<Mail />} onSelect={() => setEmailPool(true)}>
                  Email everyone in this pool…
                </MenuItem>
              )}
              <MenuItem icon={<Pencil />} onSelect={() => setPoolDialog('edit')}>
                Rename…
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => setPoolDialog('delete')}>
                Delete pool…
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}
      <SplitView
        storageKey="candidates"
        sideOpen={Boolean(preview)}
        main={
          <Card className="min-w-0 px-4 pt-1">
            <div aria-live="polite" className="sr-only">
              {rankJobId
                ? `Ranked for ${rankJobTitle ?? 'this job'}`
                : `${total} ${total === 1 ? 'person' : 'people'}`}
            </div>
            <div onKeyDownCapture={onRowKeys} onDoubleClick={onRowDoubleClick}>
              {rankJobId ? rankTable : listTable}
            </div>
          </Card>
        }
        side={
          preview && (
            <CandidatePreview
              key={preview.id}
              person={preview}
              onClose={() => setPreviewId(null)}
              onFilter={(patch) => setFilters(patch)}
            />
          )
        }
      />

      {view && (
        <>
          <ConfirmDialog
            opened={viewDialog === 'delete'}
            onClose={() => setViewDialog(null)}
            onConfirm={() =>
              deleteView.mutateAsync().then(
                () => undefined,
                () => undefined,
              )
            }
            title={`Delete the view “${view.name}”?`}
            message={
              view.shared
                ? 'It goes for the whole team. No candidate records change.'
                : 'This removes the saved filters only. No candidate records change.'
            }
            confirmLabel="Delete view"
          />
          <Modal
            opened={viewDialog === 'rename'}
            onClose={() => setViewDialog(null)}
            title="Rename view"
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => setViewDialog(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!renameText.trim()}
                  loading={updateView.isPending}
                  onClick={() => updateView.mutate({ name: renameText.trim() })}
                >
                  Rename
                </Button>
              </>
            }
          >
            <Input
              label="Name"
              value={renameText}
              onChange={(event) => setRenameText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && renameText.trim())
                  updateView.mutate({ name: renameText.trim() });
              }}
              autoFocus
            />
          </Modal>
        </>
      )}
      {pool && (
        <>
          <PoolFormModal
            pool={pool}
            opened={poolDialog === 'edit'}
            onClose={() => setPoolDialog(null)}
            onSaved={() => router.refresh()}
          />
          <ConfirmDialog
            opened={poolDialog === 'delete'}
            onClose={() => setPoolDialog(null)}
            onConfirm={() =>
              deletePool.mutateAsync().then(
                () => undefined,
                () => undefined,
              )
            }
            title={`Delete the pool ${pool.name}?`}
            message="The people in it stay in MyThorneAI. Only the list goes."
            confirmLabel="Delete pool"
          />
        </>
      )}
      <AddToPoolModal
        target={dialog?.kind === 'pool' ? dialog.target : null}
        count={dialog?.count ?? 0}
        name={dialog?.name}
        onClose={closeDialog}
      />
      {rankJobId && (
        <DismissModal
          target={dialog?.kind === 'dismiss' ? dialog.target : null}
          count={dialog?.count ?? 0}
          name={dialog?.name}
          requisitionId={rankJobId}
          onClose={closeDialog}
        />
      )}
      <BulkEmailDrawer
        opened={dialog?.kind === 'email' || emailPool}
        onClose={() => {
          closeDialog();
          setEmailPool(false);
        }}
        candidateIds={emailPool ? undefined : dialog?.target.ids}
        filter={emailPool ? undefined : dialog?.target.filter}
        poolId={emailPool ? pool?.id : undefined}
        onSent={() => setSelected([])}
      />
      <ApplyModal
        opened={dialog?.kind === 'job'}
        target={dialog?.target}
        count={dialog?.count}
        onClose={closeDialog}
      />
      <BulkTagsModal
        target={dialog?.kind === 'tags' ? dialog.target : null}
        count={dialog?.count ?? 0}
        onClose={closeDialog}
      />
      <DoNotContactModal
        target={dialog?.kind === 'dnc' ? dialog.target : null}
        count={dialog?.count ?? 0}
        name={dialog?.name}
        onClose={closeDialog}
      />
      <ConfirmDialog
        opened={dialog?.kind === 'delete'}
        onClose={closeDialog}
        onConfirm={async () => {
          if (dialog)
            await bulk.mutateAsync({ ...dialog.target, action: 'delete' }).then(
              () => undefined,
              () => undefined,
            );
        }}
        title={`Delete ${dialog?.count === 1 ? '1 candidate' : `${(dialog?.count ?? 0).toLocaleString()} candidates`}?`}
        message="Their applications, interviews, scorecards, messages, offers and files are deleted too. You cannot undo this."
        confirmLabel="Delete for good"
      />
      {/* Rejecting loads the reasons, which only the hiring team may read. */}
      {canManage && (
        <>
          <RejectManyModal
            opened={dialog?.kind === 'reject'}
            onClose={closeDialog}
            loading={bulk.isPending}
            count={dialog?.count}
            title={`Reject ${dialog?.count === 1 ? '1 person' : `${(dialog?.count ?? 0).toLocaleString()} people`} from ${jobTitle ?? 'this job'}`}
            onReject={(choice) =>
              dialog &&
              bulk.mutate({
                ...dialog.target,
                ...choice,
                action: 'reject',
                requisitionId: filters.jobId,
              })
            }
          />
          <RejectManyModal
            opened={rejecting !== null}
            onClose={() => setRejecting(null)}
            loading={bulk.isPending}
            count={1}
            title={
              rejecting
                ? `Reject ${rejecting.name} from ${rejecting.app.requisitionTitle}`
                : 'Reject'
            }
            onReject={(choice) =>
              rejecting &&
              bulk.mutate({
                ...choice,
                ids: [rejecting.id],
                action: 'reject',
                requisitionId: rejecting.app.requisitionId,
              })
            }
          />
        </>
      )}
      {rankJobId && (
        <FitDrawer requisitionId={rankJobId} candidate={fitFor} onClose={() => setFitFor(null)} />
      )}
    </>
  );
}
