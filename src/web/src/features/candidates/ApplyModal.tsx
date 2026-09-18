'use client';

import { useState } from 'react';
import { Button, Group, Modal, Select, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { RequisitionSummary } from '@/types';

export function ApplyModal({
  candidateId,
  opened,
  onClose,
}: {
  candidateId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const [requisitionId, setRequisitionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const requisitions = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/applications', { candidateId, requisitionId, source: 'Existing candidate' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      notifications.show({ color: 'teal', message: 'Application created' });
      setRequisitionId(null);
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add to a job" centered>
      <Stack>
        <Select
          searchable
          label="Open job"
          placeholder="Choose a role"
          value={requisitionId}
          onChange={setRequisitionId}
          data={
            requisitions.data?.map((item) => ({
              value: item.id,
              label: `${item.code} · ${item.title}`,
            })) ?? []
          }
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!requisitionId}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Create application
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
