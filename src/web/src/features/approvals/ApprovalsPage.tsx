'use client';

import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconChecks } from '@tabler/icons-react';
import Link from 'next/link';
import { SectionCard, EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDateTime } from '@/lib/format';
import { usePendingApprovals } from './approval-data';
import { DecideControls } from './ApprovalParts';

export function ApprovalsPage() {
  const query = usePendingApprovals();
  const items = query.data ?? [];
  return (
    <>
      <PageHeader title="Approvals" />
      {query.isError ? (
        <EmptyState
          icon={IconChecks}
          title="Could not load your approvals"
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : !query.data ? (
        <LoadingBlock rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={IconChecks} title="Nothing is waiting on you." />
      ) : (
        <Stack gap="md" maw={820}>
          {items.map((item) => {
            const href = item.applicationId
              ? `/applications/${item.applicationId}`
              : item.requisitionId
                ? `/requisitions/${item.requisitionId}`
                : null;
            return (
              <SectionCard
                key={item.id}
                title={item.title}
                action={
                  href && (
                    <Button
                      component={Link}
                      href={href}
                      variant="subtle"
                      size="xs"
                      aria-label={`Open ${item.title}`}
                    >
                      {item.applicationId ? 'Open application' : 'Open job'}
                    </Button>
                  )
                }
              >
                <Stack gap="md" p="lg">
                  <Text size="sm" c="dimmed">
                    Asked by {item.requestedByName} · {formatDateTime(item.createdAt)}
                  </Text>
                  {item.note && (
                    <Box>
                      <Text size="xs" c="dimmed" fw={600}>
                        Note from {item.requestedByName}
                      </Text>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {item.note}
                      </Text>
                    </Box>
                  )}
                  <Group>
                    <DecideControls approvalId={item.id} subject={item.title} />
                  </Group>
                </Stack>
              </SectionCard>
            );
          })}
        </Stack>
      )}
    </>
  );
}
