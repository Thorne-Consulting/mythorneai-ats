'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconPlus, IconSearch, IconUsers } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../auth';
import { api } from '../api';
import { EmptyState, initials, LoadingBlock, PageHeader, rowLinkProps } from '../components/Common';
import type { CandidateSummary } from '../types';

interface CandidateForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  linkedInUrl: string;
  source: string;
  tags: string[];
}

export function CandidatesPage() {
  const [search, setSearch] = useState('');
  const [opened, modal] = useDisclosure();
  const router = useRouter();
  const user = useCurrentUser();
  const canCreate = ['Admin', 'Recruiter'].includes(user.role);
  const query = useQuery({
    queryKey: ['candidates', search],
    queryFn: () =>
      api.get<CandidateSummary[]>(`/api/candidates?search=${encodeURIComponent(search)}`),
  });

  return (
    <>
      <PageHeader
        title="Candidates"
        description="One record per person, with every job they have been considered for."
        actions={
          canCreate && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              Add candidate
            </Button>
          )
        }
      />
      <Paper withBorder radius="lg" p="sm" mb="lg">
        <Group gap="sm" wrap="wrap">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search name, email or title"
            aria-label="Search candidates"
            leftSection={<IconSearch size={16} />}
            style={{ flex: '1 1 260px' }}
          />
          {query.data && (
            <Text size="sm" c="dimmed" ml="auto" pr="xs">
              {query.data.length} {query.data.length === 1 ? 'person' : 'people'}
            </Text>
          )}
        </Group>
      </Paper>
      {!query.data ? (
        <LoadingBlock />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={IconUsers}
          title="No candidates found"
          description={
            search
              ? 'Try another search.'
              : 'Add the first candidate to begin tracking hiring activity.'
          }
          actionLabel={canCreate && !search ? 'Add candidate' : undefined}
          onAction={modal.open}
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={840}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Candidate</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Tags</Table.Th>
                  <Table.Th>Applications</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data.map((candidate) => (
                  <Table.Tr
                    key={candidate.id}
                    {...rowLinkProps(`Open ${candidate.name}`, () =>
                      router.push(`/candidates/${candidate.id}`),
                    )}
                  >
                    <Table.Td>
                      <Group wrap="nowrap">
                        <Avatar color="teal" variant="light" radius="xl">
                          {initials(candidate.name)}
                        </Avatar>
                        <div>
                          <Group gap="xs">
                            <Text fw={650} size="sm">
                              {candidate.name}
                            </Text>
                            {candidate.doNotContact && (
                              <Badge size="xs" color="red" variant="light">
                                DNC
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {candidate.currentTitle ?? candidate.email}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{candidate.location ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{candidate.source}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={5}>
                        {candidate.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} size="xs" variant="light" color="gray" tt="none">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={candidate.activeApplications ? 'indigo' : 'gray'}
                      >
                        {candidate.activeApplications} active
                      </Badge>
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
      <CreateCandidateModal opened={opened} onClose={modal.close} />
    </>
  );
}

function CreateCandidateModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<CandidateForm>({
    initialValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: '',
      currentTitle: '',
      linkedInUrl: '',
      source: 'Direct applicant',
      tags: [],
    },
    validate: {
      firstName: (value) => (value.trim() ? null : 'Required'),
      lastName: (value) => (value.trim() ? null : 'Required'),
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'Enter a valid email'),
      source: (value) => (value.trim() ? null : 'Required'),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: CandidateForm) => api.post<{ id: string }>('/api/candidates', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      notifications.show({ color: 'teal', message: 'Candidate added' });
      form.reset();
      onClose();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not add candidate',
        message: error.message,
      }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Add candidate" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="First name" required {...form.getInputProps('firstName')} />
            <TextInput label="Last name" required {...form.getInputProps('lastName')} />
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <TextInput label="Phone" {...form.getInputProps('phone')} />
            <TextInput label="Current title" {...form.getInputProps('currentTitle')} />
            <TextInput label="Location" {...form.getInputProps('location')} />
            <TextInput
              label="Source"
              required
              placeholder="Referral, LinkedIn, direct…"
              {...form.getInputProps('source')}
            />
            <TextInput label="LinkedIn URL" {...form.getInputProps('linkedInUrl')} />
          </SimpleGrid>
          <TagsInput
            label="Tags"
            placeholder="Type and press enter"
            {...form.getInputProps('tags')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Add candidate
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
