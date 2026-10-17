'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Pagination,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconUserCheck, IconUserOff, IconUserSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatRelative } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import { useRouter } from 'next/navigation';
import type { ApplicantPage, RequisitionDetail, RequisitionSummary } from '@/types';
import { RejectManyModal } from './RejectManyModal';

const STATUS_OPTIONS = ['Active', 'Hired', 'Rejected', 'Withdrawn'];
const RATING_OPTIONS = ['1', '2', '3', '4', '5'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Highest rating' },
];

/** Applications as a table, with every filter in a sidebar beside it. */
export function ApplicantsPage({
  initialApplicants,
  initialSessions,
  embedded = false,
}: {
  initialApplicants: ApplicantPage;
  initialSessions: RequisitionSummary[];
  // Inside the Candidates hub, which supplies the page header.
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>('Active');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');
  const [location, setLocation] = useState('');
  const [resume, setResume] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetStage, setTargetStage] = useState<string | null>(null);
  const [rejectOpened, rejectModal] = useDisclosure();
  const sessions = useQuery({
    queryKey: ['requisitions', 'applicant-filter'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
    initialData: initialSessions,
  });
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: '50', sort });
    if (search) value.set('search', search);
    if (sessionId) value.set('requisitionId', sessionId);
    if (stageId) value.set('stageId', stageId);
    if (status) value.set('status', status);
    if (source) value.set('source', source);
    if (tag) value.set('tag', tag);
    if (location) value.set('location', location);
    if (resume) value.set('hasResume', resume);
    if (rating) value.set('minRating', rating);
    return value;
  }, [page, sort, search, sessionId, stageId, status, source, tag, location, resume, rating]);
  const applicants = useQuery({
    queryKey: ['applicants', params.toString()],
    queryFn: () => api.get<ApplicantPage>(`/api/applications?${params}`),
    initialData:
      params.toString() === 'page=1&pageSize=50&sort=newest&status=Active'
        ? initialApplicants
        : undefined,
  });
  const runBulk = useMutation({
    mutationFn: ({ nextStatus, reason }: { nextStatus: string; reason?: string }) =>
      api.patch('/api/applications/bulk-stage', {
        applicationIds: selected,
        stageId: targetStage,
        status: nextStatus,
        dispositionReason: reason ?? null,
      }),
    onSuccess: () => {
      setSelected([]);
      setTargetStage(null);
      rejectModal.close();
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      notifications.show({ color: 'teal', message: 'Applicants updated' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const items = applicants.data?.items ?? [];
  // Bulk moves need one job's stages. Use the filter when it is set, otherwise
  // infer it from the selection so nobody has to filter first.
  const selectedJobIds = [
    ...new Set(
      items.filter((item) => selected.includes(item.id)).map((item) => item.requisitionId),
    ),
  ];
  const bulkJobId = sessionId ?? (selectedJobIds.length === 1 ? selectedJobIds[0] : null);
  const session = useQuery({
    queryKey: ['requisition', bulkJobId],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${bulkJobId}`),
    enabled: Boolean(bulkJobId),
  });
  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
      setSelected([]);
    };
  const router = useRouter();
  const jobOptions =
    sessions.data?.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` })) ?? [];
  const stageOptions = sessionId
    ? (session.data?.stages.map((item) => ({ value: item.id, label: item.name })) ?? [])
    : [];
  const anyFilter = Boolean(
    search || sessionId || stageId || rating || resume || source || tag || location,
  );
  const clearFilters = () => {
    for (const set of [setSearch, setSource, setTag, setLocation]) set('');
    for (const set of [setSessionId, setStageId, setRating, setResume]) set(null);
    setPage(1);
    setSelected([]);
  };
  const chooseJob = (value: string | null) => {
    resetPage(setSessionId)(value);
    setStageId(null);
    setTargetStage(null);
  };
  const total = applicants.data?.total ?? 0;
  const countLabel = total === 1 ? '1 application' : `${total} applications`;
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const selectAll = (
    <Checkbox
      aria-label="Select all applications on this page"
      checked={allSelected}
      indeterminate={selected.length > 0 && !allSelected}
      onChange={(event) =>
        setSelected(event.currentTarget.checked ? items.map((item) => item.id) : [])
      }
    />
  );
  const selectOne = (item: (typeof items)[number]) => (
    <Checkbox
      aria-label={`Select ${item.candidateName}`}
      checked={selected.includes(item.id)}
      onChange={(event) => {
        const { checked } = event.currentTarget;
        setSelected((current) =>
          checked ? [...current, item.id] : current.filter((id) => id !== item.id),
        );
      }}
    />
  );
  const openRow = (item: (typeof items)[number]) =>
    rowLinkProps(`Open ${item.candidateName}`, () => router.push(`/applications/${item.id}`));
  const pages = applicants.data ? Math.ceil(applicants.data.total / applicants.data.pageSize) : 0;
  const pager = pages > 1 && (
    <Group justify="flex-end" mt="md">
      <Pagination value={page} onChange={setPage} total={pages} size="sm" />
    </Group>
  );

  return (
    <>
      {!embedded && <PageHeader title="Applications" />}
      <div className="applicants">
        <aside className="applicants-rail" aria-label="Filters">
          <TextInput
            aria-label="Search applications"
            placeholder="Search"
            value={search}
            onChange={(event) => resetPage(setSearch)(event.currentTarget.value)}
            leftSection={<IconSearch size={15} />}
          />
          <div>
            <p className="applicants-group-title">Status</p>
            <Radio.Group
              value={status ?? 'all'}
              onChange={(value) => resetPage(setStatus)(value === 'all' ? null : value)}
            >
              <Stack gap={6}>
                {[...STATUS_OPTIONS, 'all'].map((value) => (
                  <Radio
                    key={value}
                    size="xs"
                    value={value}
                    label={value === 'all' ? 'Any status' : value}
                  />
                ))}
              </Stack>
            </Radio.Group>
          </div>
          <div>
            <p className="applicants-group-title">Job</p>
            <Select
              size="xs"
              searchable
              clearable
              placeholder="All jobs"
              aria-label="Job"
              value={sessionId}
              onChange={chooseJob}
              data={jobOptions}
            />
            <Select
              mt={6}
              size="xs"
              clearable
              placeholder={sessionId ? 'All stages' : 'Pick a job first'}
              aria-label="Stage"
              disabled={!sessionId}
              value={stageId}
              onChange={resetPage(setStageId)}
              data={stageOptions}
            />
          </div>
          <div>
            <p className="applicants-group-title">Minimum rating</p>
            <SegmentedControl
              size="xs"
              fullWidth
              value={rating ?? 'any'}
              onChange={(value) => resetPage(setRating)(value === 'any' ? null : value)}
              data={[
                { value: 'any', label: 'Any' },
                ...RATING_OPTIONS.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <div>
            <p className="applicants-group-title">Resume</p>
            <SegmentedControl
              size="xs"
              fullWidth
              value={resume ?? 'any'}
              onChange={(value) => resetPage(setResume)(value === 'any' ? null : value)}
              data={[
                { value: 'any', label: 'Any' },
                { value: 'true', label: 'Has' },
                { value: 'false', label: 'Missing' },
              ]}
            />
          </div>
          <div>
            <p className="applicants-group-title">More</p>
            <Stack gap={6}>
              <TextInput
                size="xs"
                placeholder="Source"
                aria-label="Source"
                value={source}
                onChange={(event) => resetPage(setSource)(event.currentTarget.value)}
              />
              <TextInput
                size="xs"
                placeholder="Tag or skill"
                aria-label="Tag or skill"
                value={tag}
                onChange={(event) => resetPage(setTag)(event.currentTarget.value)}
              />
              <TextInput
                size="xs"
                placeholder="Location"
                aria-label="Location"
                value={location}
                onChange={(event) => resetPage(setLocation)(event.currentTarget.value)}
              />
            </Stack>
          </div>
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
        <div>
          <div className="applicants-head">
            <span className="applicants-count">{countLabel}</span>
            <Select
              size="xs"
              w={170}
              aria-label="Sort"
              value={sort}
              allowDeselect={false}
              onChange={(value) => value && resetPage(setSort)(value)}
              data={SORT_OPTIONS}
            />
          </div>
          {!applicants.data ? (
            <LoadingBlock rows={6} />
          ) : items.length === 0 ? (
            <EmptyState icon={IconUserSearch} title="No applications match these filters" />
          ) : (
            <div className="panel">
              <Table.ScrollContainer minWidth={820}>
                <Table className="inbox-table applicants-table" verticalSpacing={0}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40}>{selectAll}</Table.Th>
                      <Table.Th>Candidate</Table.Th>
                      <Table.Th>Job</Table.Th>
                      <Table.Th w={120}>Stage</Table.Th>
                      <Table.Th w={60} ta="right">
                        Fit
                      </Table.Th>
                      <Table.Th w={70} ta="right">
                        Rating
                      </Table.Th>
                      <Table.Th w={110} ta="right">
                        Last activity
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item) => (
                      <Table.Tr
                        key={item.id}
                        data-selected={selected.includes(item.id) || undefined}
                        {...openRow(item)}
                      >
                        <Table.Td onClick={(event) => event.stopPropagation()}>
                          {selectOne(item)}
                        </Table.Td>
                        <Table.Td>
                          <span className="applicants-name">{item.candidateName}</span>{' '}
                          <span className="applicants-sub">{item.currentTitle ?? ''}</span>
                        </Table.Td>
                        <Table.Td>
                          {item.requisitionTitle}{' '}
                          <span className="applicants-sub">{item.requisitionCode}</span>
                        </Table.Td>
                        <Table.Td>{item.stage}</Table.Td>
                        <Table.Td className="applicants-num">
                          {item.fitScore ?? <span className="applicants-dim">–</span>}
                        </Table.Td>
                        <Table.Td className="applicants-num">
                          {item.rating ? (
                            item.rating.toFixed(1)
                          ) : (
                            <span className="applicants-dim">–</span>
                          )}
                        </Table.Td>
                        <Table.Td
                          className={
                            item.stalled ? 'applicants-num' : 'applicants-num applicants-dim'
                          }
                          title={item.stalled ? 'Quiet for a while' : undefined}
                        >
                          {formatRelative(item.lastActivityAt)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </div>
          )}
          {pager}
        </div>
      </div>
      {selected.length > 0 && (
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
              {selected.length} selected
            </Text>
            <Select
              placeholder="Move to stage"
              value={targetStage}
              onChange={setTargetStage}
              disabled={!bulkJobId}
              data={
                session.data?.stages.map((item) => ({ value: item.id, label: item.name })) ?? []
              }
              style={{ flex: '0 1 200px' }}
            />
            <Button
              leftSection={<IconUserCheck size={15} />}
              disabled={!targetStage}
              onClick={() => runBulk.mutate({ nextStatus: 'Active' })}
            >
              Move applicants
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<IconUserOff size={15} />}
              disabled={!targetStage}
              onClick={rejectModal.open}
            >
              Reject
            </Button>
            {!bulkJobId && (
              <Text size="xs" c="dimmed">
                These people are spread across {selectedJobIds.length} jobs. Select from one job to
                move them together.
              </Text>
            )}
            <Button variant="subtle" color="gray" ml="auto" onClick={() => setSelected([])}>
              Clear
            </Button>
          </Group>
        </Paper>
      )}
      <RejectManyModal
        opened={rejectOpened}
        onClose={rejectModal.close}
        loading={runBulk.isPending}
        onReject={(reason) => runBulk.mutate({ nextStatus: 'Rejected', reason })}
      />
    </>
  );
}
