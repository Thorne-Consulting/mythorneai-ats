'use client';

import { Paper, Text, Timeline } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime } from '@/lib/format';
import { LoadError, useApplication } from './application-data';

export function ApplicationHistory({ id }: { id: string }) {
  const query = useApplication(id);
  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={3} />;

  return (
    <>
      {query.data.audit.length === 0 ? (
        <EmptyState
          icon={IconClock}
          title="No recorded history yet"
          description="Stage changes, notes, and interview decisions appear here as they happen."
        />
      ) : (
        <Paper withBorder radius="lg" p="xl">
          <Timeline bulletSize={26} lineWidth={2}>
            {query.data.audit.map((event) => (
              <Timeline.Item
                key={event.id}
                bullet={<IconClock size={14} />}
                title={event.action.replace(/([a-z])([A-Z])/g, '$1 $2')}
              >
                <Text c="dimmed" size="sm">
                  {event.actorEmail}
                </Text>
                <Text size="xs" mt={4}>
                  {formatDateTime(event.occurredAt)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      )}
    </>
  );
}
