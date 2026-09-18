'use client';

import { Badge, Button, Group, Paper, SimpleGrid, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { StatCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime, humanize } from '@/lib/format';
import { useAdminUsers } from './admin-data';
import { UserModal } from './UserModal';

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
