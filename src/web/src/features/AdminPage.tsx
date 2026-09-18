'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlugConnected, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useCurrentUser } from '../auth';
import { formatDateTime, LoadingBlock, PageHeader } from '../components/Common';
import type { AdminUser, Role } from '../types';

interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorEmail: string;
  occurredAt: string;
}

interface IntegrationStatus {
  provider: 'None' | 'Microsoft365' | 'GoogleWorkspace';
  enabled: boolean;
  calendar: string;
  pending: number;
  failed: number;
}

export function AdminPage() {
  const currentUser = useCurrentUser();
  const [opened, modal] = useDisclosure();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUser[]>('/api/admin/users'),
    enabled: currentUser.role === 'Admin',
  });
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditEvent[]>('/api/admin/audit'),
    enabled: currentUser.role === 'Admin',
  });
  const integration = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: () => api.get<IntegrationStatus>('/api/admin/integrations'),
    enabled: currentUser.role === 'Admin',
  });
  const queryClient = useQueryClient();
  const retryFailed = useMutation({
    mutationFn: () => api.post<{ count: number }>('/api/admin/integrations/retry-failed'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      notifications.show({ color: 'teal', message: `${result.count} failed deliveries queued` });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (currentUser.role !== 'Admin') {
    return (
      <Paper withBorder radius="lg" p={48} ta="center">
        <IconShieldCheck size={34} color="var(--mantine-color-gray-5)" />
        <Title order={2} mt="md">
          Administrator access required
        </Title>
        <Text c="dimmed" mt="xs">
          Your account cannot view users or security audit data.
        </Text>
      </Paper>
    );
  }

  return (
    <div>
      <PageHeader
        title="Administration"
        description="Access control and immutable system activity."
      />
      <Tabs defaultValue="users">
        <Tabs.List mb="xl">
          <Tabs.Tab value="users">Users and roles</Tabs.Tab>
          <Tabs.Tab value="integrations">Microsoft and Google</Tabs.Tab>
          <Tabs.Tab value="audit">Audit log</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users">
          <Group justify="space-between" mb="lg">
            <div>
              <Title order={3}>Company access</Title>
              <Text c="dimmed" size="sm">
                Only active, pre-authorized users can sign in.
              </Text>
            </div>
            <Button leftSection={<IconPlus size={16} />} onClick={modal.open}>
              Add or update user
            </Button>
          </Group>
          {!users.data ? (
            <LoadingBlock />
          ) : (
            <Paper withBorder radius="lg" className="table-shell">
              <Table.ScrollContainer minWidth={720}>
                <Table verticalSpacing="md" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User</Table.Th>
                      <Table.Th>Role</Table.Th>
                      <Table.Th>Team scope</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Updated</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users.data.map((user) => (
                      <Table.Tr key={user.id}>
                        <Table.Td>
                          <Text size="sm" fw={650}>
                            {user.displayName}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {user.email}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="indigo" tt="none">
                            {user.role.replace(/([a-z])([A-Z])/g, '$1 $2')}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{user.department ?? 'All'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={user.isActive ? 'teal' : 'gray'}>
                            {user.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatDateTime(user.updatedAt)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="integrations">
          {!integration.data ? (
            <LoadingBlock />
          ) : (
            <Paper withBorder radius="lg" p="xl">
              <Group justify="space-between" align="flex-start">
                <Group align="flex-start">
                  <IconPlugConnected size={28} color="var(--mantine-color-indigo-6)" />
                  <div>
                    <Title order={3}>
                      {integration.data.enabled ? integration.data.provider : 'Internal-only mode'}
                    </Title>
                    <Text c="dimmed" size="sm" mt={4}>
                      {integration.data.enabled
                        ? `Interview invitations use ${integration.data.provider}.`
                        : 'No external calendar provider is active.'}
                    </Text>
                  </div>
                </Group>
                <Group>
                  <Badge
                    color={integration.data.enabled ? 'teal' : 'gray'}
                    variant="light"
                    size="lg"
                  >
                    {integration.data.enabled ? 'Configured' : 'Not configured'}
                  </Badge>
                  {integration.data.failed > 0 && (
                    <Button
                      color="red"
                      variant="light"
                      loading={retryFailed.isPending}
                      onClick={() => retryFailed.mutate()}
                    >
                      Retry {integration.data.failed} failed
                    </Button>
                  )}
                </Group>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl">
                <Paper bg="gray.0" radius="md" p="lg">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Calendar
                  </Text>
                  <Text fw={650} mt={6}>
                    {integration.data.calendar}
                  </Text>
                  <Text size="sm" c="dimmed" mt={3}>
                    {integration.data.enabled
                      ? 'Invitations and online meeting links are queued automatically.'
                      : 'Interviews remain visible inside the ATS.'}
                  </Text>
                </Paper>
                <Paper bg="gray.0" radius="md" p="lg">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Delivery queue
                  </Text>
                  <Text fw={650} mt={6}>
                    {integration.data.pending} pending
                  </Text>
                  <Text size="sm" c={integration.data.failed ? 'red' : 'dimmed'} mt={3}>
                    {integration.data.failed} failed
                  </Text>
                </Paper>
              </SimpleGrid>
            </Paper>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="audit">
          <Group mb="lg">
            <IconShieldCheck size={20} />
            <div>
              <Title order={3}>Audit log</Title>
              <Text c="dimmed" size="sm">
                Recent security and business events
              </Text>
            </div>
          </Group>
          {!audit.data ? (
            <LoadingBlock />
          ) : (
            <Paper withBorder radius="lg" className="table-shell">
              <Table.ScrollContainer minWidth={760}>
                <Table verticalSpacing="sm" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Event</Table.Th>
                      <Table.Th>Entity</Table.Th>
                      <Table.Th>Actor</Table.Th>
                      <Table.Th>Time</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {audit.data.map((event) => (
                      <Table.Tr key={event.id}>
                        <Table.Td>
                          <Text size="sm" fw={650}>
                            {event.action.replace(/([a-z])([A-Z])/g, '$1 $2')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{event.entityType}</Text>
                          <Text size="xs" c="dimmed">
                            {event.entityId.slice(0, 12)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{event.actorEmail}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatDateTime(event.occurredAt)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}
        </Tabs.Panel>
      </Tabs>
      <UserModal opened={opened} onClose={modal.close} />
    </div>
  );
}

function UserModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('Interviewer');
  const [department, setDepartment] = useState('');
  const [isActive, setIsActive] = useState(true);
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/admin/users', {
        email,
        displayName,
        role,
        department: department || null,
        isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      notifications.show({ color: 'teal', message: 'User access saved' });
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Add or update user</Title>}
      centered
    >
      <Stack>
        <TextInput
          label="Company email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <TextInput
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
        />
        <SimpleGrid cols={2}>
          <Select
            label="Role"
            value={role}
            onChange={(value) => value && setRole(value as Role)}
            data={[
              { value: 'Admin', label: 'Administrator' },
              { value: 'Recruiter', label: 'Recruiter' },
              { value: 'HiringManager', label: 'Hiring manager' },
              { value: 'Interviewer', label: 'Interviewer' },
            ]}
            allowDeselect={false}
          />
          <TextInput
            label="Team scope"
            value={department}
            onChange={(e) => setDepartment(e.currentTarget.value)}
          />
        </SimpleGrid>
        <Switch
          label="Account is active"
          checked={isActive}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!email.includes('@') || !displayName.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save access
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
