'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Collapse,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconUserCheck,
  IconUserOff,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { PageHeader } from '@/components/ui/PageHeaders';
import type { ApplicantPage, RequisitionDetail, RequisitionSummary } from '@/types';
import { ApplicantResults } from './ApplicantResults';
import { RejectManyModal } from './RejectManyModal';

export function ApplicantsPage({
  initialApplicants,
  initialSessions,
}: {
  initialApplicants: ApplicantPage;
  initialSessions: RequisitionSummary[];
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
  const [showMore, { toggle: toggleMore }] = useDisclosure(false);
  const activeExtraFilters = [source, tag, location, resume, rating].filter(Boolean).length;
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
  return (
    <>
      <PageHeader
        title="Applications"
      />
      <Paper withBorder radius="lg" p="md" mb="lg">
        <Stack gap="sm">
          <Group gap="sm" wrap="wrap" align="flex-end">
            <TextInput
              label="Search"
              placeholder="Name, email, title, or tag"
              value={search}
              onChange={(event) => resetPage(setSearch)(event.currentTarget.value)}
              leftSection={<IconSearch size={15} />}
              style={{ flex: '2 1 260px' }}
            />
            <Select
              searchable
              clearable
              label="Job"
              placeholder="All jobs"
              value={sessionId}
              onChange={(value) => {
                resetPage(setSessionId)(value);
                setStageId(null);
                setTargetStage(null);
              }}
              data={
                sessions.data?.map((item) => ({
                  value: item.id,
                  label: `${item.code} · ${item.title}`,
                })) ?? []
              }
              style={{ flex: '2 1 240px' }}
            />
            <Select
              clearable
              label="Stage"
              placeholder={sessionId ? 'All stages' : 'Pick a job first'}
              value={stageId}
              onChange={resetPage(setStageId)}
              disabled={!sessionId}
              data={
                session.data?.stages.map((item) => ({ value: item.id, label: item.name })) ?? []
              }
              style={{ flex: '1 1 160px' }}
            />
            <Select
              clearable
              label="Status"
              value={status}
              onChange={resetPage(setStatus)}
              data={['Active', 'Rejected', 'Withdrawn', 'Hired']}
              style={{ flex: '1 1 140px' }}
            />
            <Button
              variant={showMore ? 'light' : 'default'}
              onClick={toggleMore}
              rightSection={showMore ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
            >
              Filters
              {activeExtraFilters > 0 && (
                <Badge ml={8} size="xs" circle variant="filled">
                  {activeExtraFilters}
                </Badge>
              )}
            </Button>
          </Group>
          <Collapse in={showMore}>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 6 }} spacing="sm" pt={4}>
              <TextInput
                label="Source"
                value={source}
                onChange={(event) => resetPage(setSource)(event.currentTarget.value)}
              />
              <TextInput
                label="Tag or skill"
                value={tag}
                onChange={(event) => resetPage(setTag)(event.currentTarget.value)}
              />
              <TextInput
                label="Location"
                value={location}
                onChange={(event) => resetPage(setLocation)(event.currentTarget.value)}
              />
              <Select
                clearable
                label="Resume"
                placeholder="Any"
                value={resume}
                onChange={resetPage(setResume)}
                data={[
                  { value: 'true', label: 'Has resume' },
                  { value: 'false', label: 'Missing resume' },
                ]}
              />
              <Select
                clearable
                label="Minimum rating"
                placeholder="Any"
                value={rating}
                onChange={resetPage(setRating)}
                data={['1', '2', '3', '4', '5']}
              />
              <Select
                label="Sort"
                value={sort}
                onChange={(value) => value && resetPage(setSort)(value)}
                data={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'name', label: 'Name' },
                  { value: 'rating', label: 'Highest rating' },
                ]}
              />
            </SimpleGrid>
          </Collapse>
        </Stack>
      </Paper>
      {selected.length > 0 && (
        <Paper withBorder radius="lg" p="sm" mb="md" pos="sticky" top={72} style={{ zIndex: 2 }}>
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
      <ApplicantResults
        data={applicants.data}
        selected={selected}
        setSelected={setSelected}
        page={page}
        setPage={setPage}
      />
      <RejectManyModal
        opened={rejectOpened}
        onClose={rejectModal.close}
        loading={runBulk.isPending}
        onReject={(reason) => runBulk.mutate({ nextStatus: 'Rejected', reason })}
      />
    </>
  );
}
