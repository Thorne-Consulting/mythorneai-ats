'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Pagination,
  Paper,
  Rating,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconUserCheck, IconUserOff } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import { formatDate, LoadingBlock, PageHeader, StatusBadge } from '../components/Common';
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
  const sessions = useQuery({
    queryKey: ['requisitions', 'applicant-filter'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  const session = useQuery({
    queryKey: ['requisition', sessionId],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${sessionId}`),
    enabled: Boolean(sessionId),
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
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
      setSelected([]);
    };
  return (
    <div>
      <PageHeader
        title="Applicants"
        description="Review, filter, and move applicants across every hiring session."
      />
      <Stack gap="sm" mb="lg">
        <Group align="flex-end">
          <TextInput
            label="Search"
            placeholder="Name, email, title, or tag"
            value={search}
            onChange={(event) => resetPage(setSearch)(event.currentTarget.value)}
            leftSection={<IconSearch size={15} />}
            style={{ flex: 1 }}
          />
          <Select
            searchable
            clearable
            label="Hiring session"
            placeholder="All sessions"
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
            w={300}
          />
          <Select
            clearable
            label="Stage"
            placeholder="All stages"
            value={stageId}
            onChange={resetPage(setStageId)}
            disabled={!sessionId}
            data={session.data?.stages.map((item) => ({ value: item.id, label: item.name })) ?? []}
            w={180}
          />
          <Select
            clearable
            label="Status"
            value={status}
            onChange={resetPage(setStatus)}
            data={['Active', 'Rejected', 'Withdrawn', 'Hired']}
            w={150}
          />
        </Group>
        <Group align="flex-end">
          <TextInput
            label="Source"
            value={source}
            onChange={(event) => resetPage(setSource)(event.currentTarget.value)}
            w={170}
          />
          <TextInput
            label="Tag or skill"
            value={tag}
            onChange={(event) => resetPage(setTag)(event.currentTarget.value)}
            w={170}
          />
          <TextInput
            label="Location"
            value={location}
            onChange={(event) => resetPage(setLocation)(event.currentTarget.value)}
            w={180}
          />
          <Select
            clearable
            label="Resume"
            value={resume}
            onChange={resetPage(setResume)}
            data={[
              { value: 'true', label: 'Has resume' },
              { value: 'false', label: 'Missing resume' },
            ]}
            w={160}
          />
          <Select
            clearable
            label="Minimum rating"
            value={rating}
            onChange={resetPage(setRating)}
            data={['1', '2', '3', '4', '5']}
            w={150}
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
            w={170}
          />
        </Group>
      </Stack>
      {selected.length > 0 && (
        <Paper withBorder p="sm" mb="md">
          <Group>
            <Text fw={650}>{selected.length} selected</Text>
            <Select
              placeholder="Move to stage"
              value={targetStage}
              onChange={setTargetStage}
              disabled={!sessionId}
              data={
                session.data?.stages.map((item) => ({ value: item.id, label: item.name })) ?? []
              }
              w={200}
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
            <Button variant="subtle" color="gray" onClick={() => setSelected([])}>
              Clear
            </Button>
          </Group>
        </Paper>
      )}
      {!applicants.data ? (
        <LoadingBlock />
      ) : (
        <Paper withBorder className="table-shell">
          <Table.ScrollContainer minWidth={1100}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selected.length > 0 && !allSelected}
                      onChange={(event) =>
                        setSelected(event.currentTarget.checked ? items.map((item) => item.id) : [])
                      }
                    />
                  </Table.Th>
                  <Table.Th>Applicant</Table.Th>
                  <Table.Th>Hiring session</Table.Th>
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
                    className="clickable-row"
                    onClick={() => router.push(`/applications/${item.id}`)}
                  >
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(item.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.currentTarget.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
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
                      <StatusBadge status={item.stage} />
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
    </div>
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
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Reject selected applicants</Title>}
    >
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
