'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  Popover,
  Radio,
  SegmentedControl,
  Select,
  Stack,
  Table,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconDots,
  IconSearch,
  IconSparkles,
  IconUserCheck,
  IconUserOff,
  IconUserSearch,
  IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatRelative } from '@/lib/format';
import { RejectManyModal } from '@/features/applicants/RejectManyModal';
import { FitDrawer } from '@/features/talent/FitDrawer';
import type {
  CandidateListApplication,
  CandidateListItem,
  CandidateListPage,
  RequisitionDetail,
  RequisitionSummary,
} from '@/types';
import { BLANK, candidateParams, DEFAULT_LIST_QUERY, type Filters } from './candidate-filters';
import { CandidatePreview, type PreviewPerson, SkillText } from './CandidatePreview';

const STATUS_OPTIONS = ['Active', 'Hired', 'Rejected', 'Withdrawn'];
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
type SavedView = { id: string; name: string; paramsJson: string };

/**
 * Everyone in one list: one row per person. Filters cover the person and their applications.
 * With a job chosen, rows show that job's stage and can be moved or rejected together, and
 * describing who you need ranks everyone on file against the job.
 */
export function CandidatesList({
  initialData,
  initialJobId,
}: {
  initialData: CandidateListPage;
  initialJobId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const staff = ['Admin', 'Recruiter'].includes(user.role);
  const canManage = staff || user.role === 'HiringManager';

  const [filters, setFilters] = useState<Filters>({ ...BLANK, jobId: initialJobId ?? null });
  const [page, setPage] = useState(1);
  const [describe, setDescribe] = useState('');
  const [ranking, setRanking] = useState<{ jobId: string; query: string } | null>(
    staff && initialJobId ? { jobId: initialJobId, query: '' } : null,
  );
  const [rankPage, setRankPage] = useState(1);
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [targetStage, setTargetStage] = useState<string | null>(null);
  const [bulkRejectOpened, bulkReject] = useDisclosure();
  const [rejecting, setRejecting] = useState<{
    name: string;
    app: CandidateListApplication;
  } | null>(null);
  const [fitFor, setFitFor] = useState<{ id: string; name: string } | null>(null);
  const [dismissFor, setDismissFor] = useState<RankedCandidate | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [saveOpened, saveMenu] = useDisclosure();
  const [saveName, setSaveName] = useState('');

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
    setFilters(BLANK);
    setPage(1);
    setSelected([]);
  };
  const anyFilter = JSON.stringify(filters) !== JSON.stringify(BLANK);

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
    initialData: params === DEFAULT_LIST_QUERY ? initialData : undefined,
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
  const savedViews = useQuery({
    queryKey: ['saved-views', 'talent'],
    queryFn: () => api.get<SavedView[]>('/api/saved-views?area=talent'),
    enabled: staff,
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
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
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
      notifications.show({ color: 'teal', message: 'Moved' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
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
      bulkReject.close();
      refreshAll();
      notifications.show({
        color: 'teal',
        message:
          apps.length === 1 ? 'Application rejected' : `${apps.length} applications rejected`,
      });
    },
    onError: (error: Error) => {
      refreshAll();
      notifications.show({ color: 'red', message: error.message });
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
      notifications.show({
        color: 'teal',
        message: 'Added to this job. Find them on its pipeline.',
      });
      refreshAll();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const dismiss = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${ranking!.jobId}/dismissals`, {
        candidateId: dismissFor!.candidateId,
        reason: dismissReason.trim(),
      }),
    onSuccess: () => {
      notifications.show({
        color: 'teal',
        message: `${dismissFor?.name} is hidden from this job's ranking. Show dismissed to bring them back.`,
      });
      setDismissFor(null);
      setDismissReason('');
      refreshAll();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const undoDismiss = useMutation({
    mutationFn: (candidateId: string) =>
      api.delete(`/api/requisitions/${ranking!.jobId}/dismissals/${candidateId}`),
    onSuccess: refreshAll,
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/saved-views', {
        area: 'talent',
        name: saveName.trim(),
        paramsJson: JSON.stringify({ filters, describe }),
      }),
    onSuccess: () => {
      setSaveName('');
      saveMenu.close();
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
      notifications.show({ color: 'teal', message: 'Saved' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const applyView = (id: string | null) => {
    const view = savedViews.data?.find((item) => item.id === id);
    if (!view) return;
    // Older views from Find for a job stored { jobId, query, minYears, location }.
    const saved = JSON.parse(view.paramsJson) as {
      filters?: Partial<Filters>;
      describe?: string;
      jobId?: string | null;
      query?: string;
      minYears?: number | null;
      location?: string;
    };
    const next: Filters = saved.filters
      ? { ...BLANK, ...saved.filters }
      : {
          ...BLANK,
          jobId: saved.jobId ?? null,
          minYears: saved.minYears ?? '',
          location: saved.location ?? '',
        };
    setFilters(next);
    setDescribe(saved.describe ?? saved.query ?? '');
    setPage(1);
    setRanking(null);
  };

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
  const preview = people.find((person) => person.id === previewId) ?? people[0];

  const selectedApps = useMemo(
    () =>
      items
        .filter((person) => selected.includes(person.id))
        .map((person) => person.applications.find((app) => app.requisitionId === filters.jobId))
        .filter((app): app is CandidateListApplication => Boolean(app)),
    [items, selected, filters.jobId],
  );
  const allSelected = items.length > 0 && items.every((person) => selected.includes(person.id));
  const canBulk = canManage && Boolean(filters.jobId) && !ranking;

  const jobOptions =
    jobs.data?.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` })) ?? [];
  const stageOptions = filters.jobId
    ? (job.data?.stages.map((stage) => ({ value: stage.id, label: stage.name })) ?? [])
    : [];
  const rankJobTitle = jobs.data?.find((item) => item.id === ranking?.jobId)?.title;

  const selectRow = (id: string) => ({
    'data-active': preview?.id === id || undefined,
    tabIndex: 0,
    onClick: () => setPreviewId(id),
    onDoubleClick: () => router.push(`/candidates/${id}`),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter') router.push(`/candidates/${id}`);
      if (event.key === ' ') {
        event.preventDefault();
        setPreviewId(id);
      }
    },
  });
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    notifications.show({ message: `Copied ${email}` });
  };

  const rail = (
    <aside className="applicants-rail" aria-label="Filters">
      <TextInput
        aria-label="Search people"
        placeholder="Search names, resumes, skills"
        value={filters.search}
        onChange={(event) => set('search', event.currentTarget.value)}
        leftSection={<IconSearch size={15} />}
      />
      <div>
        <p className="applicants-group-title">Job</p>
        <Select
          size="xs"
          searchable
          clearable
          placeholder="Any job"
          aria-label="Job"
          value={filters.jobId}
          onChange={(value) => set('jobId', value)}
          data={jobOptions}
        />
        <Select
          mt={6}
          size="xs"
          clearable
          placeholder={filters.jobId ? 'Any stage' : 'Pick a job first'}
          aria-label="Stage"
          disabled={!filters.jobId}
          value={filters.stageId}
          onChange={(value) => set('stageId', value)}
          data={stageOptions}
        />
      </div>
      <div>
        <p className="applicants-group-title">Application status</p>
        <Radio.Group
          value={filters.status ?? 'any'}
          onChange={(value) => set('status', value === 'any' ? null : value)}
        >
          <Stack gap={6}>
            <Radio size="xs" value="any" label="Anyone" />
            {STATUS_OPTIONS.map((value) => (
              <Radio key={value} size="xs" value={value} label={value} />
            ))}
          </Stack>
        </Radio.Group>
      </div>
      <div>
        <p className="applicants-group-title">Minimum rating</p>
        <SegmentedControl
          size="xs"
          fullWidth
          value={filters.minRating ?? 'any'}
          onChange={(value) => set('minRating', value === 'any' ? null : value)}
          data={['any', '1', '2', '3', '4', '5'].map((value) => ({
            value,
            label: value === 'any' ? 'Any' : value,
          }))}
        />
      </div>
      <div>
        <p className="applicants-group-title">Skills</p>
        <TagsInput
          size="xs"
          aria-label="Skills"
          placeholder="Type a skill, press Enter"
          value={filters.skills}
          onChange={(value) =>
            set(
              'skills',
              value.map((item) => item.toLowerCase()),
            )
          }
        />
        <SegmentedControl
          mt={6}
          size="xs"
          fullWidth
          value={filters.skillMode}
          onChange={(value) => set('skillMode', value)}
          data={[
            { value: 'any', label: 'Any of them' },
            { value: 'all', label: 'All of them' },
          ]}
        />
      </div>
      <div>
        <p className="applicants-group-title">Background</p>
        <Stack gap={6}>
          <TextInput
            size="xs"
            placeholder="Job title"
            aria-label="Job title"
            value={filters.title}
            onChange={(event) => set('title', event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            placeholder="Location"
            aria-label="Location"
            value={filters.location}
            onChange={(event) => set('location', event.currentTarget.value)}
          />
          <NumberInput
            size="xs"
            placeholder="Minimum years"
            aria-label="Minimum years of experience"
            suffix=" years"
            min={0}
            max={50}
            value={filters.minYears}
            onChange={(value) => set('minYears', value)}
          />
          <Select
            size="xs"
            clearable
            placeholder="Any seniority"
            aria-label="Minimum seniority"
            data={SENIORITY_OPTIONS}
            value={filters.seniority}
            onChange={(value) => set('seniority', value)}
          />
          <Select
            size="xs"
            clearable
            placeholder="Any degree"
            aria-label="Minimum degree"
            data={DEGREE_OPTIONS}
            value={filters.minDegree}
            onChange={(value) => set('minDegree', value)}
          />
          <TextInput
            size="xs"
            placeholder="Worked at"
            aria-label="Company"
            value={filters.company}
            onChange={(event) => set('company', event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            placeholder="Studied at"
            aria-label="School"
            value={filters.school}
            onChange={(event) => set('school', event.currentTarget.value)}
          />
          <Select
            size="xs"
            clearable
            placeholder="Any source"
            aria-label="Source"
            data={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(value) => set('source', value)}
          />
        </Stack>
      </div>
      <div>
        <p className="applicants-group-title">Resume</p>
        <SegmentedControl
          size="xs"
          fullWidth
          value={filters.hasResume ?? 'any'}
          onChange={(value) => set('hasResume', value === 'any' ? null : value)}
          data={[
            { value: 'any', label: 'Any' },
            { value: 'true', label: 'Read' },
            { value: 'false', label: 'Not yet' },
          ]}
        />
      </div>
      <Checkbox
        size="xs"
        label="Include do-not-contact"
        checked={filters.includeDnc}
        onChange={(event) => set('includeDnc', event.currentTarget.checked)}
      />
      {anyFilter && (
        <button
          type="button"
          className="text-action"
          onClick={clearFilters}
          style={{ alignSelf: 'flex-start' }}
        >
          Clear all filters
        </button>
      )}
    </aside>
  );

  const describeBar = staff && (
    <div className="candidates-describe">
      <TextInput
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
        leftSection={<IconSparkles size={16} />}
        style={{ flex: '1 1 320px' }}
      />
      <Button
        onClick={runDescribe}
        loading={toFilters.isPending}
        disabled={!filters.jobId && !describe.trim()}
      >
        {filters.jobId ? 'Rank for this job' : 'Set filters'}
      </Button>
      {savedViews.data && savedViews.data.length > 0 && (
        <Select
          aria-label="Saved views"
          placeholder="Saved views"
          data={savedViews.data.map((view) => ({ value: view.id, label: view.name }))}
          value={null}
          onChange={applyView}
          w={170}
        />
      )}
      <Popover
        opened={saveOpened}
        onChange={saveMenu.toggle}
        position="bottom-end"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <Button variant="default" onClick={saveMenu.toggle}>
            Save view
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={240}>
            <TextInput
              label="Name"
              placeholder="e.g. Chicago React leads"
              value={saveName}
              onChange={(event) => setSaveName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && saveName.trim()) saveView.mutate();
              }}
              autoFocus
            />
            <Button size="sm" disabled={!saveName.trim()} onClick={() => saveView.mutate()}>
              Save
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </div>
  );

  const rankTable = !rank.data ? (
    <LoadingBlock rows={6} />
  ) : (
    <>
      {rank.data.note && (
        <Alert color="yellow" mb="sm">
          {rank.data.note}
        </Alert>
      )}
      {rank.data.pending > 0 && (
        <Text size="sm" c="dimmed" mb="sm">
          {rank.data.pending} resumes are still being read and will rank once they are.
        </Text>
      )}
      {rankItems.length === 0 ? (
        <EmptyState icon={IconUserSearch} title="Nobody on file matches this job yet" />
      ) : (
        <div className="panel">
          <Table.ScrollContainer minWidth={760}>
            <Table className="inbox-table applicants-table candidates-table" verticalSpacing={0}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={70} ta="right">
                    Score
                  </Table.Th>
                  <Table.Th>Candidate</Table.Th>
                  <Table.Th>Matches</Table.Th>
                  <Table.Th w={130}>This job</Table.Th>
                  <Table.Th w={44} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rankItems.map((item) => (
                  <Table.Tr
                    key={item.candidateId}
                    data-dismissed={item.dismissed || undefined}
                    {...selectRow(item.candidateId)}
                  >
                    <Table.Td className="applicants-num">
                      <span className="candidates-score">{Math.round(item.score)}</span>
                    </Table.Td>
                    <Table.Td>
                      <span className="applicants-name">{item.name}</span>
                      {item.currentTitle && (
                        <span className="applicants-title">{item.currentTitle}</span>
                      )}
                    </Table.Td>
                    <Table.Td className="candidates-matches">
                      {item.matched.length ? (
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
                        <span className="applicants-dim">No named matches</span>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {item.dismissed ? (
                        <span className="applicants-dim">Dismissed</span>
                      ) : item.appliedToJob ? (
                        'Applied'
                      ) : (
                        <span className="applicants-dim">Not yet</span>
                      )}
                      {item.fitScore != null && (
                        <span className="applicants-title">assessed {item.fitScore}</span>
                      )}
                    </Table.Td>
                    <Table.Td onClick={stop}>
                      <Menu position="bottom-end" withArrow shadow="md">
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`Actions for ${item.name}`}
                          >
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {!item.appliedToJob && !item.dismissed && (
                            <Menu.Item onClick={() => addToJob.mutate(item.candidateId)}>
                              Add to this job
                            </Menu.Item>
                          )}
                          <Menu.Item
                            onClick={() => setFitFor({ id: item.candidateId, name: item.name })}
                          >
                            Why this ranking
                          </Menu.Item>
                          <Menu.Item onClick={() => router.push(`/candidates/${item.candidateId}`)}>
                            Open profile
                          </Menu.Item>
                          <Menu.Item onClick={() => copyEmail(item.email)}>Copy email</Menu.Item>
                          <Menu.Divider />
                          {item.dismissed ? (
                            <Menu.Item onClick={() => undoDismiss.mutate(item.candidateId)}>
                              Bring back
                            </Menu.Item>
                          ) : (
                            <Menu.Item color="red" onClick={() => setDismissFor(item)}>
                              Dismiss for this job…
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </div>
      )}
    </>
  );

  const total = ranking ? (rank.data?.total ?? 0) : (list.data?.total ?? 0);
  const pageSize = ranking ? (rank.data?.pageSize ?? 25) : (list.data?.pageSize ?? 25);
  const pages = Math.ceil(total / pageSize);

  // Shared pieces for the list layouts below.
  const stageOf = (app?: CandidateListApplication) =>
    app ? (app.status === 'Active' ? app.stage : app.status) : null;
  const listState = !list.data ? (
    <LoadingBlock rows={6} />
  ) : items.length === 0 ? (
    <EmptyState
      icon={IconUserSearch}
      title="Nobody matches these filters"
      actionLabel={anyFilter ? 'Clear filters' : undefined}
      onAction={clearFilters}
    />
  ) : null;
  const headCheck = canBulk && (
    <Table.Th w={40}>
      <Checkbox
        aria-label="Select everyone on this page"
        checked={allSelected}
        indeterminate={selected.length > 0 && !allSelected}
        onChange={(event) =>
          setSelected(event.currentTarget.checked ? items.map((person) => person.id) : [])
        }
      />
    </Table.Th>
  );
  const rowCheck = (person: CandidateListItem, app?: CandidateListApplication) =>
    canBulk && (
      <Table.Td w={40} onClick={stop}>
        <Checkbox
          aria-label={`Select ${person.name}`}
          checked={selected.includes(person.id)}
          disabled={!app}
          onChange={(event) => {
            const { checked } = event.currentTarget;
            setSelected((current) =>
              checked ? [...current, person.id] : current.filter((id) => id !== person.id),
            );
          }}
        />
      </Table.Td>
    );
  const rowMenu = (person: CandidateListItem, app?: CandidateListApplication) => (
    <Table.Td w={44} onClick={stop}>
      <Menu position="bottom-end" withArrow shadow="md">
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Actions for ${person.name}`}
          >
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => router.push(`/candidates/${person.id}`)}>
            Open profile
          </Menu.Item>
          {person.applications.map((item) => (
            <Menu.Item key={item.id} onClick={() => router.push(`/applications/${item.id}`)}>
              Open {item.requisitionTitle}
            </Menu.Item>
          ))}
          {person.email !== 'Restricted' && (
            <Menu.Item onClick={() => copyEmail(person.email)}>Copy email</Menu.Item>
          )}
          {canManage && app?.status === 'Active' && (
            <>
              <Menu.Divider />
              <Menu.Item color="red" onClick={() => setRejecting({ name: person.name, app })}>
                Reject from {app.requisitionTitle}…
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Table.Td>
  );
  const listHead = (
    <div className="applicants-head">
      <span className="applicants-count" aria-live="polite">
        {ranking
          ? `Ranked for ${rankJobTitle ?? 'this job'}`
          : `${total} ${total === 1 ? 'person' : 'people'}`}
      </span>
      {ranking ? (
        <Group gap="sm">
          <Checkbox
            size="xs"
            label={`Show dismissed${rank.data?.dismissed ? ` (${rank.data.dismissed})` : ''}`}
            checked={includeDismissed}
            onChange={(event) => setIncludeDismissed(event.currentTarget.checked)}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconX size={14} />}
            onClick={() => setRanking(null)}
          >
            Back to the list
          </Button>
        </Group>
      ) : (
        <Select
          size="xs"
          w={160}
          aria-label="Sort"
          value={filters.sort}
          allowDeselect={false}
          onChange={(value) => value && set('sort', value)}
          data={SORT_OPTIONS}
        />
      )}
    </div>
  );
  const pager = pages > 1 && (
    <Group justify="flex-end" mt="md">
      <Pagination
        size="sm"
        total={pages}
        value={ranking ? rankPage : page}
        onChange={ranking ? setRankPage : setPage}
      />
    </Group>
  );

  return (
    <>
      {describeBar}
      <div className="candidates">
        {rail}
        <div className="candidates-main">
          {listHead}
          {ranking
            ? rankTable
            : (listState ?? (
                <div className="panel">
                  <Table.ScrollContainer minWidth={640}>
                    <Table
                      className="inbox-table candidates-table person-table"
                      verticalSpacing={0}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          {headCheck}
                          <Table.Th>Person</Table.Th>
                          <Table.Th>Job</Table.Th>
                          <Table.Th w={130}>Stage</Table.Th>
                          <Table.Th w={64} ta="right">
                            Exp.
                          </Table.Th>
                          <Table.Th w={110}>Last activity</Table.Th>
                          <Table.Th w={44} />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {items.map((person) => {
                          const app = shownApp(person);
                          return (
                            <Table.Tr
                              key={person.id}
                              data-selected={selected.includes(person.id) || undefined}
                              {...selectRow(person.id)}
                            >
                              {rowCheck(person, app)}
                              <Table.Td>
                                <span className="person-cut person-name">{person.name}</span>
                                <span className="person-cut person-sub">
                                  {person.currentTitle ?? 'No title'}
                                </span>
                              </Table.Td>
                              <Table.Td>
                                <span className="person-cut person-main">
                                  {app ? (
                                    app.requisitionTitle
                                  ) : (
                                    <span className="person-sub">No job yet</span>
                                  )}
                                </span>
                                <span className="person-cut person-sub">
                                  {app
                                    ? `${app.requisitionCode}${person.applications.length > 1 ? ` · +${person.applications.length - 1} more` : ''}`
                                    : person.source}
                                </span>
                              </Table.Td>
                              <Table.Td>
                                <span className="person-cut person-main">
                                  {stageOf(app) ?? '–'}
                                </span>
                                {app?.rating ? (
                                  <span className="person-cut person-sub">
                                    Rated {app.rating.toFixed(1)}
                                  </span>
                                ) : null}
                              </Table.Td>
                              <Table.Td className="person-num">
                                {person.experienceYears != null
                                  ? `${person.experienceYears} yrs`
                                  : '–'}
                              </Table.Td>
                              <Table.Td>
                                <span className="person-cut person-sub">
                                  {formatRelative(app?.lastActivityAt ?? person.updatedAt)}
                                </span>
                              </Table.Td>
                              {rowMenu(person, app)}
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </div>
              ))}
          {pager}
        </div>
        {preview && (
          <CandidatePreview
            key={preview.id}
            person={preview}
            onFilter={(patch) => {
              setFilters((current) => ({ ...current, ...patch }));
              setPage(1);
            }}
          />
        )}
      </div>

      {canBulk && selected.length > 0 && (
        <Paper
          className="bulk-bar"
          withBorder
          radius="lg"
          p="sm"
          shadow="md"
          role="region"
          aria-label="Bulk actions"
        >
          <Group gap="sm" wrap="wrap">
            <Text fw={650} size="sm">
              {selectedApps.length} selected
            </Text>
            <Select
              placeholder="Move to stage"
              aria-label="Move to stage"
              value={targetStage}
              onChange={setTargetStage}
              data={stageOptions}
              style={{ flex: '0 1 200px' }}
            />
            <Button
              leftSection={<IconUserCheck size={15} />}
              disabled={!targetStage || selectedApps.length === 0}
              loading={moveMany.isPending}
              onClick={() => moveMany.mutate(selectedApps.map((app) => app.id))}
            >
              Move
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<IconUserOff size={15} />}
              disabled={selectedApps.filter((app) => app.status === 'Active').length === 0}
              onClick={bulkReject.open}
            >
              Reject
            </Button>
            <Button variant="subtle" color="gray" ml="auto" onClick={() => setSelected([])}>
              Clear
            </Button>
          </Group>
        </Paper>
      )}

      <RejectManyModal
        opened={bulkRejectOpened}
        onClose={bulkReject.close}
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
        title={dismissFor ? `Dismiss ${dismissFor.name} for this job` : ''}
      >
        <Stack>
          <Textarea
            label="Why"
            description="Recorded with the decision. Keep it about the job."
            value={dismissReason}
            onChange={(event) => setDismissReason(event.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDismissFor(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={!dismissReason.trim()}
              loading={dismiss.isPending}
              onClick={() => dismiss.mutate()}
            >
              Dismiss
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
