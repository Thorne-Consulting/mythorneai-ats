'use client';

import { Group, Paper, Table, Text, ThemeIcon, Title } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime, humanize } from '@/lib/format';
import { type AuditEvent, isAdmin } from './admin-data';

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
