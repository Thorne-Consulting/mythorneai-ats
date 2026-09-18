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
  Title,
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
    <div>
      <PageHeader
        title="Hiring sessions"
        description="Team, required headcount, owners, and the full applicant pipeline."
        actions={
          canCreate && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              New hiring session
            </Button>
          )
        }
      />
      <Group mb="lg" align="flex-end">
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search role, code, or team"
          leftSection={<IconSearch size={16} />}
          w={{ base: '100%', sm: 340 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          clearable
          placeholder="All statuses"
          data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
          w={{ base: '100%', sm: 180 }}
        />
      </Group>

      {!query.data ? (
        <LoadingBlock />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={IconBriefcase2}
          title="No hiring sessions found"
          description={
            search || status
              ? 'Try a different filter.'
              : 'Create the first hiring session to start reviewing applicants.'
          }
          actionLabel={canCreate && !search && !status ? 'Create hiring session' : undefined}
          onAction={modal.open}
        />
      ) : (
        <Paper withBorder radius="lg" className="table-shell">
          <Table.ScrollContainer minWidth={920}>
            <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Pipeline</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Target start</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data.map((item) => (
                  <Table.Tr
                    key={item.id}
                    className="clickable-row"
                    onClick={() => router.push(`/requisitions/${item.id}`)}
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
                      <Badge variant="light" color="indigo" tt="none">
                        {item.activeApplications} active
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.ownerEmail.split('@')[0]}</Text>
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
    </div>
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
      notifications.show({ color: 'teal', message: 'Hiring session created' });
      form.reset();
      onClose();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not create hiring session',
        message: error.message,
      }),
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>New hiring session</Title>}
      size="lg"
      centered
    >
      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Session code"
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
