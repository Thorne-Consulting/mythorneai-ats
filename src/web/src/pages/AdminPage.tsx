import { useState } from 'react';
import { Badge, Button, Group, Modal, Paper, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconShieldCheck } from '@tabler/icons-react';
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

export function AdminPage() {
  const currentUser = useCurrentUser();
  const [opened, modal] = useDisclosure();
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/api/admin/users'), enabled: currentUser.role === 'Admin' });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.get<AuditEvent[]>('/api/admin/audit'), enabled: currentUser.role === 'Admin' });

  if (currentUser.role !== 'Admin') {
    return <Paper withBorder radius="lg" p={48} ta="center"><IconShieldCheck size={34} color="var(--mantine-color-gray-5)" /><Title order={2} mt="md">Administrator access required</Title><Text c="dimmed" mt="xs">Your account cannot view users or security audit data.</Text></Paper>;
  }

  return (
    <div>
      <PageHeader title="Administration" description="Access control and immutable system activity." />
      <Tabs defaultValue="users">
        <Tabs.List mb="xl"><Tabs.Tab value="users">Users and roles</Tabs.Tab><Tabs.Tab value="audit">Audit log</Tabs.Tab></Tabs.List>
        <Tabs.Panel value="users">
          <Group justify="space-between" mb="lg"><div><Title order={3}>Company access</Title><Text c="dimmed" size="sm">Only active, pre-authorized users can sign in.</Text></div><Button leftSection={<IconPlus size={16} />} onClick={modal.open}>Add or update user</Button></Group>
          {!users.data ? <LoadingBlock /> : <Paper withBorder radius="lg" className="table-shell"><Table.ScrollContainer minWidth={720}><Table verticalSpacing="md" horizontalSpacing="lg"><Table.Thead><Table.Tr><Table.Th>User</Table.Th><Table.Th>Role</Table.Th><Table.Th>Department</Table.Th><Table.Th>Status</Table.Th><Table.Th>Updated</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{users.data.map((user) => <Table.Tr key={user.id}><Table.Td><Text size="sm" fw={650}>{user.displayName}</Text><Text size="xs" c="dimmed">{user.email}</Text></Table.Td><Table.Td><Badge variant="light" color="indigo" tt="none">{user.role.replace(/([a-z])([A-Z])/g, '$1 $2')}</Badge></Table.Td><Table.Td><Text size="sm">{user.department ?? 'All'}</Text></Table.Td><Table.Td><Badge variant="light" color={user.isActive ? 'teal' : 'gray'}>{user.isActive ? 'Active' : 'Disabled'}</Badge></Table.Td><Table.Td><Text size="sm" c="dimmed">{formatDateTime(user.updatedAt)}</Text></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer></Paper>}
        </Tabs.Panel>
        <Tabs.Panel value="audit">
          <Group mb="lg"><IconShieldCheck size={20} /><div><Title order={3}>Audit log</Title><Text c="dimmed" size="sm">Recent security and business events</Text></div></Group>
          {!audit.data ? <LoadingBlock /> : <Paper withBorder radius="lg" className="table-shell"><Table.ScrollContainer minWidth={760}><Table verticalSpacing="sm" horizontalSpacing="lg"><Table.Thead><Table.Tr><Table.Th>Event</Table.Th><Table.Th>Entity</Table.Th><Table.Th>Actor</Table.Th><Table.Th>Time</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{audit.data.map((event) => <Table.Tr key={event.id}><Table.Td><Text size="sm" fw={650}>{event.action.replace(/([a-z])([A-Z])/g, '$1 $2')}</Text></Table.Td><Table.Td><Text size="sm">{event.entityType}</Text><Text size="xs" c="dimmed">{event.entityId.slice(0, 12)}</Text></Table.Td><Table.Td><Text size="sm">{event.actorEmail}</Text></Table.Td><Table.Td><Text size="sm" c="dimmed">{formatDateTime(event.occurredAt)}</Text></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer></Paper>}
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
    mutationFn: () => api.post('/api/admin/users', { email, displayName, role, department: department || null, isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); notifications.show({ color: 'teal', message: 'User access saved' }); onClose(); },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return <Modal opened={opened} onClose={onClose} title={<Title order={3}>Add or update user</Title>} centered><Stack><TextInput label="Company email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} /><TextInput label="Display name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} /><SimpleGrid cols={2}><Select label="Role" value={role} onChange={(value) => value && setRole(value as Role)} data={[{ value: 'Admin', label: 'Administrator' }, { value: 'Recruiter', label: 'Recruiter' }, { value: 'HiringManager', label: 'Hiring manager' }, { value: 'Interviewer', label: 'Interviewer' }, { value: 'Hr', label: 'HR' }]} allowDeselect={false} /><TextInput label="Department scope" value={department} onChange={(e) => setDepartment(e.currentTarget.value)} /></SimpleGrid><Switch label="Account is active" checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} /><Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button disabled={!email.includes('@') || !displayName.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Save access</Button></Group></Stack></Modal>;
}
