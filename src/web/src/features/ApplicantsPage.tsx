'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  Pagination,
  Paper,
  Rating,
  Select,
  SimpleGrid,
  Stack,
  Table,
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
  IconUserSearch,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import {
  EmptyState,
  formatDate,
  LoadingBlock,
  PageHeader,
  rowLinkProps,
  StageBadge,
} from '../components/Common';
import type { ApplicantPage, RequisitionDetail, RequisitionSummary } from '../types';

export function ApplicantsPage() {
  const router = useRouter();
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
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
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
        description="Every application across every job, in one list."
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
      {!applicants.data ? (
        <LoadingBlock rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={IconUserSearch}
          title="No applicants match these filters"
          description="Clear a filter or widen the search to see more people."
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={1100}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={44}>
                    <Checkbox
                      aria-label="Select all applicants on this page"
                      checked={allSelected}
                      indeterminate={selected.length > 0 && !allSelected}
                      onChange={(event) =>
                        setSelected(event.currentTarget.checked ? items.map((item) => item.id) : [])
                      }
                    />
                  </Table.Th>
                  <Table.Th>Applicant</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Stage</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Resume</Table.Th>
                  <Table.Th>Rating</Table.Th>
                  <Table.Th>Applied</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item) => (
                  <Table.Tr
                    key={item.id}
                    {...rowLinkProps(`Open ${item.candidateName}`, () =>
                      router.push(`/applications/${item.id}`),
                    )}
                  >
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${item.candidateName}`}
                        checked={selected.includes(item.id)}
                        onChange={(event) => {
                          // Read the event before setSelected: React may run the
                          // updater after the synthetic event has been released.
                          const { checked } = event.currentTarget;
                          setSelected((current) =>
                            checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          );
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text fw={650} size="sm">
                        {item.candidateName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.currentTitle ?? item.email} · {item.location ?? 'No location'}
                      </Text>
                      <Group gap={4} mt={4}>
                        {item.tags.slice(0, 4).map((value) => (
                          <Badge key={value} size="xs" variant="light" color="gray">
                            {value}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.requisitionTitle}</Text>
                      <Text size="xs" c="dimmed">
                        {item.requisitionCode} · {item.team}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StageBadge stage={item.stage} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.source}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={item.hasResume ? 'teal' : 'orange'} variant="light">
                        {item.hasResume
                          ? `${item.resumeCount} file${item.resumeCount === 1 ? '' : 's'}`
                          : 'Missing'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {item.rating ? (
                        <Rating value={item.rating} readOnly size="xs" />
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(item.appliedAt)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      {applicants.data && applicants.data.total > applicants.data.pageSize && (
        <Group justify="space-between" mt="lg">
          <Text size="sm" c="dimmed">
            {applicants.data.total} applicants
          </Text>
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.ceil(applicants.data.total / applicants.data.pageSize)}
          />
        </Group>
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

function RejectManyModal({
  opened,
  onClose,
  loading,
  onReject,
}: {
  opened: boolean;
  onClose: () => void;
  loading: boolean;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <Modal opened={opened} onClose={onClose} title="Reject selected applicants">
      <Stack>
        <Select
          label="Disposition reason"
          value={reason}
          onChange={setReason}
          data={[
            'Does not meet minimum requirements',
            'Skills mismatch',
            'Experience mismatch',
            'Compensation mismatch',
            'Location or availability',
            'Withdrew',
            'Position closed',
            'Other',
          ]}
        />
        <Text size="sm" c="dimmed">
          The same job-related reason is recorded for each selected applicant.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!reason}
            loading={loading}
            onClick={() => reason && onReject(reason)}
          >
            Reject applicants
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
