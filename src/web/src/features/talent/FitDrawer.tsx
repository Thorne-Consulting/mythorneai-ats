'use client';

import { useEffect } from 'react';
import { Alert, Badge, Button, Drawer, Group, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDateTime } from '@/lib/format';

type Fit = {
  score: number;
  cached: boolean;
  createdAt: string;
  result: {
    summary: string;
    requirements: Array<{
      requirement: string;
      kind: 'required' | 'preferred';
      status: 'met' | 'partial' | 'missing' | 'unknown';
      evidence: string;
    }>;
    concerns: string[];
  };
};

const STATUS = {
  met: { label: 'Met', color: 'teal' },
  partial: { label: 'Partly', color: 'yellow' },
  missing: { label: 'Not found', color: 'red' },
  unknown: { label: "Can't tell", color: 'gray' },
} as const;

export function FitDrawer({
  requisitionId,
  candidate,
  onClose,
}: {
  requisitionId: string;
  candidate: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const run = useMutation({
    mutationFn: (refresh: boolean) =>
      api.post<Fit>(
        `/api/requisitions/${requisitionId}/fit/${candidate?.id}${refresh ? '?refresh=true' : ''}`,
      ),
    onError: (error: Error, refresh) => {
      if (refresh) notifications.show({ color: 'red', message: error.message });
    },
    onSuccess: (_result, refresh) => {
      if (refresh) notifications.show({ color: 'teal', message: 'Assessment re-run' });
    },
  });
  const { mutate, reset } = run;
  useEffect(() => {
    reset();
    if (candidate) mutate(false);
  }, [candidate?.id, requisitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = run.data;
  return (
    <Drawer
      opened={!!candidate}
      onClose={onClose}
      position="right"
      size="xl"
      title={candidate ? `Assess fit: ${candidate.name}` : ''}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          AI-generated assessment. It&apos;s a starting point; you decide.
        </Text>
        {run.isPending && <Text size="sm">Reading the resume against the requirements…</Text>}
        {run.isError && !fit && (
          <Alert color="gray" variant="light" title="No assessment yet">
            {run.error.message}
          </Alert>
        )}
        {fit && (
          <>
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
              <div>
                <Text size="xs" c="dimmed">
                  Requirements met (draft)
                </Text>
                <Text fz={28} fw={650} lh={1.1} className="tnum">
                  {fit.score}
                  <Text span size="sm" c="dimmed">
                    {' '}
                    / 100
                  </Text>
                </Text>
                <Text size="xs" c="dimmed">
                  {fit.cached ? 'Saved result from ' : 'Just run, '}
                  {formatDateTime(fit.createdAt)}
                </Text>
              </div>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconRefresh size={14} />}
                loading={run.isPending}
                onClick={() => run.mutate(true)}
              >
                Re-run
              </Button>
            </Group>
            {fit.result.summary && <Text size="sm">{fit.result.summary}</Text>}
            <Table.ScrollContainer minWidth={420}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Requirement</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Evidence from the resume</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {fit.result.requirements.map((row) => {
                    const status = STATUS[row.status] ?? STATUS.unknown;
                    return (
                      <Table.Tr key={`${row.kind}-${row.requirement}`}>
                        <Table.Td>
                          <Text size="sm">{row.requirement}</Text>
                          <Text size="xs" c="dimmed">
                            {row.kind === 'required' ? 'Required' : 'Preferred'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={status.color} tt="none">
                            {status.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={row.evidence ? undefined : 'dimmed'}>
                            {row.evidence || 'Nothing quoted'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {fit.result.concerns.length > 0 && (
              <div>
                <Text size="sm" fw={650} mb={4}>
                  Things to check
                </Text>
                <Stack gap={4}>
                  {fit.result.concerns.map((concern) => (
                    <Text key={concern} size="sm">
                      {concern}
                    </Text>
                  ))}
                </Stack>
              </div>
            )}
          </>
        )}
      </Stack>
    </Drawer>
  );
}
