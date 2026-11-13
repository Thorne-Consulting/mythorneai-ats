'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Modal, Select, toast } from '@/components/ui';
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
      toast.success('Added to the job');
      setRequisitionId(null);
      onClose();
    },
    onError: (error: Error) => toast.error('Could not add them to the job', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add to a job"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!requisitionId}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Add to job
          </Button>
        </>
      }
    >
      <Select
        label="Open job"
        placeholder="Choose a job"

        value={requisitionId}
        onChange={setRequisitionId}
        data={
          requisitions.data?.map((item) => ({
            value: item.id,
            label: `${item.code} · ${item.title}`,
          })) ?? []
        }
      />
    </Modal>
  );
}
