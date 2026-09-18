'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconBriefcase2, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import {
  EmptyState,
  formatDate,
  LoadingBlock,
  PageHeader,
  rowLinkProps,
  StatusBadge,
} from '../components/Common';
import type { RequisitionSummary } from '../types';
import { useCurrentUser } from '../auth';

interface RequisitionForm {
  code: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number;
  ownerEmail: string;
  recruiterEmail: string;
  description: string;
  targetStartDate: string;
}

export function RequisitionsPage() {
  const [opened, modal] = useDisclosure();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();
  const user = useCurrentUser();
  const canCreate = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const query = useQuery({
    queryKey: ['requisitions', search, status],
    queryFn: () =>
      api.get<RequisitionSummary[]>(
        `/api/requisitions?search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`,
      ),
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Open roles, who owns them, and how full each pipeline is."
        actions={
          canCreate && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              New job
            </Button>
          )
        }
      />
      <Paper withBorder radius="lg" p="sm" mb="lg">
        <Group gap="sm" wrap="wrap">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search role, code, or team"
            aria-label="Search jobs"
            leftSection={<IconSearch size={16} />}
            style={{ flex: '1 1 260px' }}
          />
          <Select
            value={status}
            onChange={setStatus}
            clearable
            placeholder="All statuses"
            aria-label="Filter by status"
            data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
            style={{ flex: '0 1 180px' }}
          />
          {query.data && (
            <Text size="sm" c="dimmed" ml="auto" pr="xs">
              {query.data.length} {query.data.length === 1 ? 'job' : 'jobs'}
            </Text>
          )}
        </Group>
      </Paper>

      {!query.data ? (
        <LoadingBlock />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={IconBriefcase2}
          title="No jobs found"
          description={
            search || status
              ? 'Try a different filter.'
              : 'Create the first job to start reviewing applicants.'
          }
          actionLabel={canCreate && !search && !status ? 'Create job' : undefined}
          onAction={modal.open}
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={920}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Pipeline</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Target start</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data.map((item) => (
                  <Table.Tr
                    key={item.id}
                    {...rowLinkProps(`Open ${item.title}`, () =>
                      router.push(`/requisitions/${item.id}`),
                    )}
                  >
                    <Table.Td>
                      <Text fw={650} size="sm">
                        {item.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.code} · {item.department}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={item.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.location}</Text>
                      <Text size="xs" c="dimmed">
                        {item.workMode}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={item.activeApplications ? 'indigo' : 'gray'}>
                        {item.activeApplications} active
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate maw={180}>
                        {item.ownerEmail}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(item.targetStartDate)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="gray">
                        <IconArrowRight size={17} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <CreateRequisitionModal opened={opened} onClose={modal.close} />
    </>
  );
}

function CreateRequisitionModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<RequisitionForm>({
    initialValues: {
      code: '',
      title: '',
      department: '',
      location: '',
      employmentType: 'Full time',
      workMode: 'Hybrid',
      openings: 1,
      ownerEmail: '',
      recruiterEmail: '',
      description: '',
      targetStartDate: '',
    },
    validate: {
      code: (value) => (value.trim() ? null : 'Required'),
      title: (value) => (value.trim() ? null : 'Required'),
      department: (value) => (value.trim() ? null : 'Required'),
      location: (value) => (value.trim() ? null : 'Required'),
      openings: (value) => (value >= 1 ? null : 'At least one opening'),
      ownerEmail: (value) => (value.includes('@') ? null : 'Enter an email'),
      recruiterEmail: (value) => (value.includes('@') ? null : 'Enter an email'),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: RequisitionForm) =>
      api.post<{ id: string }>('/api/requisitions', {
        ...values,
        targetStartDate: values.targetStartDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job created' });
      form.reset();
      onClose();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not create job',
        message: error.message,
      }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New job" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Job code"
              placeholder="ENG-105"
              required
              {...form.getInputProps('code')}
            />
            <TextInput
              label="Job title"
              placeholder="Product designer"
              required
              {...form.getInputProps('title')}
            />
            <TextInput
              label="Team"
              placeholder="Engineering, sales, operations…"
              required
              {...form.getInputProps('department')}
            />
            <TextInput
              label="Location"
              placeholder="Chicago, IL"
              required
              {...form.getInputProps('location')}
            />
            <Select
              label="Employment type"
              data={['Full time', 'Part time', 'Contract', 'Internship', 'Temporary']}
              {...form.getInputProps('employmentType')}
            />
            <Select
              label="Work mode"
              data={['On-site', 'Hybrid', 'Remote']}
              {...form.getInputProps('workMode')}
            />
            <NumberInput
              label="Openings"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('openings')}
            />
            <TextInput
              type="date"
              label="Target start"
              {...form.getInputProps('targetStartDate')}
            />
            <TextInput
              label="Hiring manager email"
              required
              {...form.getInputProps('ownerEmail')}
            />
            <TextInput label="Recruiter email" required {...form.getInputProps('recruiterEmail')} />
          </SimpleGrid>
          <Textarea
            label="Role summary"
            minRows={4}
            placeholder="What will this person own?"
            {...form.getInputProps('description')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create draft
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
