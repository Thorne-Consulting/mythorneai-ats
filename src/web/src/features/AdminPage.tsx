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
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlugConnected, IconPlus, IconShieldCheck, IconShieldLock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useCurrentUser } from '../auth';
import {
  EmptyState,
  formatDateTime,
  humanize,
  LoadingBlock,
  PageHeader,
  PageTabs,
  StatCard,
} from '../components/Common';
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

const isAdmin = (role: string) => role === 'Admin';

function useAdminUsers() {
  const currentUser = useCurrentUser();
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUser[]>('/api/admin/users'),
    enabled: isAdmin(currentUser.role),
  });
}

/** Header and section links shared by every administration route. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();

  if (!isAdmin(currentUser.role)) {
    return (
      <Paper withBorder radius="lg" p={48} ta="center" maw={520} mx="auto" mt="xl">
        <ThemeIcon variant="light" color="gray" size={48} radius="md" mx="auto">
          <IconShieldLock size={24} stroke={1.6} />
        </ThemeIcon>
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
    <>
      <PageHeader
        title="Administration"
        description="Access control and immutable system activity."
      />
      <PageTabs
        items={[
          { label: 'Users and roles', href: '/admin', count: users.data?.length },
          { label: 'Microsoft and Google', href: '/admin/integrations' },
          { label: 'Audit log', href: '/admin/audit' },
        ]}
      />
      {children}
    </>
  );
}

export function AdminUsers() {
  const [opened, modal] = useDisclosure();
  const users = useAdminUsers();
  const list = users.data ?? [];
  const active = list.filter((user) => user.isActive).length;
  const admins = list.filter((user) => user.role === 'Admin').length;
  const interviewers = list.filter((user) => user.role === 'Interviewer').length;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 260px' }}>
          <Title order={3}>Company access</Title>
          <Text c="dimmed" size="sm">
            Only active, pre-authorized users can sign in.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={modal.open}>
          Add or update user
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
        <StatCard label="People with access" value={list.length} />
        <StatCard label="Active" value={active} hint={`${list.length - active} disabled`} />
        <StatCard label="Administrators" value={admins} />
        <StatCard label="Interviewers" value={interviewers} />
      </SimpleGrid>

      {!users.data ? (
        <LoadingBlock rows={4} />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover={false}>
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
                      <Badge variant="light" color="indigo">
                        {humanize(user.role)}
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
      <UserModal opened={opened} onClose={modal.close} />
    </>
  );
}

export function AdminIntegrations() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const integration = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: () => api.get<IntegrationStatus>('/api/admin/integrations'),
    enabled: isAdmin(currentUser.role),
  });
  const retryFailed = useMutation({
    mutationFn: () => api.post<{ count: number }>('/api/admin/integrations/retry-failed'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      notifications.show({ color: 'teal', message: `${result.count} failed deliveries queued` });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (!integration.data) return <LoadingBlock rows={2} />;
  const status = integration.data;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 260px' }}>
          <Title order={3}>Calendar delivery</Title>
          <Text c="dimmed" size="sm">
            How interview invitations reach Microsoft 365 or Google Workspace.
          </Text>
        </div>
        {status.failed > 0 && (
          <Button
            color="red"
            variant="light"
            loading={retryFailed.isPending}
            onClick={() => retryFailed.mutate()}
          >
            Retry {status.failed} failed
          </Button>
        )}
      </Group>

      <Paper withBorder radius="lg" p="xl" mb="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group align="flex-start" wrap="nowrap" style={{ flex: '1 1 300px' }}>
            <ThemeIcon variant="light" color="indigo" size={42} radius="md">
              <IconPlugConnected size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>{status.enabled ? status.provider : 'Internal-only mode'}</Title>
              <Text c="dimmed" size="sm" mt={4}>
                {status.enabled
                  ? `Interview invitations use ${status.provider}.`
                  : 'No external calendar provider is active. Interviews stay visible inside the ATS.'}
              </Text>
            </div>
          </Group>
          <Badge color={status.enabled ? 'teal' : 'gray'} variant="light" size="lg">
            {status.enabled ? 'Configured' : 'Not configured'}
          </Badge>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard label="Calendar" text={status.calendar} />
        <StatCard label="Queued deliveries" value={status.pending} hint="Waiting to send" />
        <StatCard
          label="Failed deliveries"
          value={status.failed}
          hint={status.failed ? 'Needs a retry' : 'Nothing to retry'}
          danger={status.failed > 0}
        />
      </SimpleGrid>
    </>
  );
}

export function AdminAudit() {
  const currentUser = useCurrentUser();
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditEvent[]>('/api/admin/audit'),
    enabled: isAdmin(currentUser.role),
  });
  const events = audit.data ?? [];
  const actors = new Set(events.map((event) => event.actorEmail)).size;

  return (
    <>
      <Group mb="lg" wrap="nowrap">
        <ThemeIcon variant="light" color="gray" size={38} radius="md">
          <IconShieldCheck size={20} />
        </ThemeIcon>
        <div>
          <Title order={3}>Audit log</Title>
          <Text c="dimmed" size="sm">
            {events.length} recent security and business {events.length === 1 ? 'event' : 'events'}
            {actors > 0 && ` from ${actors} ${actors === 1 ? 'actor' : 'actors'}`}
          </Text>
        </div>
      </Group>
      {!audit.data ? (
        <LoadingBlock rows={5} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={IconShieldCheck}
          title="Nothing recorded yet"
          description="Stage moves, hiring decisions, and access changes are written here as they happen."
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Entity</Table.Th>
                  <Table.Th>Actor</Table.Th>
                  <Table.Th>Time</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>
                      <Text size="sm" fw={650}>
                        {humanize(event.action)}
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
    </>
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
    <Modal opened={opened} onClose={onClose} title="Add or update user" centered>
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
