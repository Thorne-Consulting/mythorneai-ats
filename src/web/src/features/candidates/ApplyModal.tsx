'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, Modal, SearchSelect, Select } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { CandidateDetail, RequisitionDetail, RequisitionSummary } from '@/types';
import { useBulkCandidates, type BulkTarget } from './candidate-actions';

/**
 * Add one person (or many) to an open job, at the stage you choose. For one person it hides the
 * jobs they are already in and warns when someone dismissed them from that job.
 */
export function ApplyModal({
  candidateId,
  candidate,
  target,
  count = 1,
  opened,
  onClose,
}: {
  candidateId?: string;
  /** The record, when you have it, for "already in" and dismissals. */
  candidate?: Pick<CandidateDetail, 'applications' | 'dismissals'>;
  /** Many people: the selection or everyone matching. */
  target?: BulkTarget;
  count?: number;
  opened: boolean;
  onClose: () => void;
}) {
  const [requisitionId, setRequisitionId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const requisitions = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened,
  });
  const job = useQuery({
    queryKey: ['requisition', requisitionId],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${requisitionId}`),
    enabled: Boolean(requisitionId),
  });
  const close = () => {
    setRequisitionId(null);
    setStageId(null);
    onClose();
  };
  const bulk = useBulkCandidates(close);
  const activeIn = new Set(
    candidate?.applications
      .filter((app) => app.status === 'Active')
      .map((app) => app.requisitionId),
  );
  const dismissal = candidate?.dismissals?.find((item) => item.requisitionId === requisitionId);
  const stages = (job.data?.stages ?? [])
    .filter((stage) => !stage.isTerminal)
    .map((stage) => ({ value: stage.id, label: stage.name }));
  const who: BulkTarget | undefined = target ?? (candidateId ? { ids: [candidateId] } : undefined);

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={count === 1 ? 'Add to a job' : `Add ${count.toLocaleString()} people to a job`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!requisitionId || !who}
            loading={bulk.isPending}
            onClick={() =>
              who && bulk.mutate({ ...who, action: 'addToJob', requisitionId, stageId })
            }
          >
            Add to job
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchSelect
          label="Job"
          placeholder="Search open jobs"
          value={requisitionId}
          onChange={(value) => {
            setRequisitionId(value);
            setStageId(null);
          }}
          nothingFound="No open job matches"
          data={
            requisitions.data?.map((item) => ({
              value: item.id,
              label: activeIn.has(item.id)
                ? `${item.title} · already in this job`
                : `${item.title} · ${item.code}`,
              disabled: activeIn.has(item.id),
            })) ?? []
          }
        />
        {requisitionId && (
          <Select
            label="Starting stage"
            placeholder={stages[0]?.label ?? 'First stage'}
            value={stageId}
            onChange={setStageId}
            data={stages}
          />
        )}
        {dismissal && (
          <Alert tone="warning" title="Dismissed from this job before">
            {dismissal.dismissedBy} dismissed them on {formatDate(dismissal.createdAt)}: “
            {dismissal.reason}”
          </Alert>
        )}
      </div>
    </Modal>
  );
}
