'use client';

import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
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
      <div className="section-head">
        <h2 className="section-title">Interview kits</h2>
        {canManage && requisition.interviewKits.length > 0 && (
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={14} />}
            onClick={() => router.push(`/requisitions/${id}/kits/new`)}
          >
            New kit
          </Button>
        )}
      </div>
      {requisition.interviewKits.length === 0 ? (
        <div className="panel empty-row">
          <Text size="sm" c="dimmed">
            No kits yet. A kit gives every interviewer the same questions and scoring scale.
          </Text>
          {canManage && (
            <Button
              size="xs"
              variant="default"
              onClick={() => router.push(`/requisitions/${id}/kits/new`)}
            >
              Add a kit
            </Button>
          )}
        </div>
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
