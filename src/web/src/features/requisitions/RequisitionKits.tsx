'use client';

import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { useCanManage, useRequisition } from './requisition-data';

export function RequisitionKits({ id }: { id: string }) {
  const router = useRouter();
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);

  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 280px' }}>
          <Title order={3}>Interview kits</Title>
          <Text c="dimmed" size="sm">
            Shared instructions and scoring criteria every interviewer works from.
          </Text>
        </div>
        {canManage && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => router.push(`/requisitions/${id}/kits/new`)}
          >
            New kit
          </Button>
        )}
      </Group>
      {requisition.interviewKits.length === 0 ? (
        <EmptyState
          icon={IconClipboardList}
          title="No interview kits yet"
          description="Kits keep every interviewer on the same questions and the same scoring scale, which makes candidates comparable."
          actionLabel={canManage ? 'Add the first kit' : undefined}
          onAction={() => router.push(`/requisitions/${id}/kits/new`)}
        />
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {requisition.interviewKits.map((kit) => (
            <Paper key={kit.id} withBorder radius="lg" p="lg">
              <Group justify="space-between" wrap="nowrap" mb={kit.instructions ? 'xs' : 'md'}>
                <Text fw={650}>{kit.name}</Text>
                <Badge variant="light" color="gray">
                  {kit.durationMinutes} min
                </Badge>
              </Group>
              {kit.instructions && (
                <Text size="sm" c="dimmed" mb="md">
                  {kit.instructions}
                </Text>
              )}
              <Text size="xs" c="dimmed" fw={500} mb="xs">
                {kit.criteria.length} scored{' '}
                {kit.criteria.length === 1 ? 'competency' : 'competencies'}
              </Text>
              <Stack gap="sm">
                {kit.criteria.map((criterion) => (
                  <Paper key={criterion.id} p="md" radius="md" bg="var(--surface-sunken)">
                    <Group justify="space-between" wrap="nowrap" mb={4}>
                      <Text size="sm" fw={650}>
                        {criterion.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        weight {criterion.weight}
                      </Text>
                    </Group>
                    <Text size="sm">{criterion.question}</Text>
                    {criterion.description && (
                      <Text size="xs" c="dimmed" mt={6}>
                        Good looks like: {criterion.description}
                      </Text>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
