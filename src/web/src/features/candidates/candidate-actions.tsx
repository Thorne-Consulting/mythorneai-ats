'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Modal,
  RadioGroup,
  SegmentedControl,
  TagsInput,
  Textarea,
  toast,
} from '@/components/ui';

/** Who a bulk action is for: the selected people, or everyone matching the list's filters. */
export type BulkTarget =
  { ids: string[]; filter?: undefined } | { filter: string; ids?: undefined };
export type BulkAction =
  | 'addTags'
  | 'removeTags'
  | 'doNotContact'
  | 'allowContact'
  | 'addToJob'
  | 'move'
  | 'reject'
  | 'delete'
  | 'addToPool'
  | 'removeFromPool'
  | 'dismiss';
export type BulkRequest = BulkTarget & {
  action: BulkAction;
  tags?: string[];
  requisitionId?: string | null;
  stageId?: string | null;
  reason?: string | null;
  sendEmail?: boolean;
  /** For reject: the reason's group, so "They decided" closes as Withdrawn with no email. */
  status?: 'Rejected' | 'Withdrawn';
  /** For reject: send the rejection email later (ISO time), and tidy up what is still open. */
  sendAt?: string | null;
  cancelInterviews?: boolean;
  withdrawOffer?: boolean;
  poolId?: string;
};
type BulkResult = { done: number; skipped: number; message: string };

/** POST /api/candidates/bulk, then refresh every list and record that may show these people. */
export function useBulkCandidates(onDone?: (result: BulkResult) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BulkRequest) => api.post<BulkResult>('/api/candidates/bulk', request),
    onSuccess: (result) => {
      for (const key of [
        'candidates',
        'candidate',
        'talent-rank',
        'board',
        'candidate-tags',
        'talent-pools',
        'candidate-activity',
      ])
        queryClient.invalidateQueries({ queryKey: [key] });
      if (result.skipped > 0) toast(result.message);
      else toast.success(result.message);
      onDone?.(result);
    },
    onError: (error: Error) => toast.error('That did not work', error.message),
  });
}

/** Tags already in use, most used first, for autocomplete. */
export function useTagOptions(enabled = true) {
  return useQuery({
    queryKey: ['candidate-tags'],
    queryFn: () => api.get<{ tag: string; count: number }[]>('/api/candidates/tags'),
    enabled,
    staleTime: 60_000,
  });
}

/** Add tags to, or remove them from, many people at once. */
export function BulkTagsModal({
  target,
  count,
  onClose,
}: {
  target: BulkTarget | null;
  count: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'addTags' | 'removeTags'>('addTags');
  const [tags, setTags] = useState<string[]>([]);
  const options = useTagOptions(target !== null);
  const bulk = useBulkCandidates(() => {
    setTags([]);
    onClose();
  });
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={count === 1 ? 'Change tags' : `Change tags for ${count.toLocaleString()} people`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={tags.length === 0}
            loading={bulk.isPending}
            onClick={() => target && bulk.mutate({ ...target, action: mode, tags })}
          >
            {mode === 'addTags' ? 'Add tags' : 'Remove tags'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label="Add or remove"
          value={mode}
          onValueChange={(value) => setMode(value as 'addTags' | 'removeTags')}
          items={[
            { value: 'addTags', label: 'Add' },
            { value: 'removeTags', label: 'Remove' },
          ]}
        />
        <TagsInput
          label="Tags"
          placeholder="Type a tag and press Enter"
          data={options.data?.map((item) => item.tag) ?? []}
          value={tags}
          onChange={(value) => setTags(value.map((tag) => tag.trim().toLowerCase()))}
        />
      </div>
    </Modal>
  );
}

/** Mark people do not contact (with an optional reason). Email actions then hide for them. */
export function DoNotContactModal({
  target,
  count,
  name,
  onClose,
}: {
  target: BulkTarget | null;
  count: number;
  /** The person's name when it is one person. */
  name?: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const bulk = useBulkCandidates(() => {
    setReason('');
    onClose();
  });
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={
        name
          ? `Mark ${name} do not contact`
          : `Mark ${count.toLocaleString()} people do not contact`
      }
      description="We stop sending them email, and email buttons hide on their record."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={bulk.isPending}
            onClick={() =>
              target && bulk.mutate({ ...target, action: 'doNotContact', reason: reason.trim() })
            }
          >
            Mark do not contact
          </Button>
        </>
      }
    >
      <Textarea
        label="Reason (optional)"
        placeholder="For example, asked not to be contacted again"
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        minRows={2}
      />
    </Modal>
  );
}

/** Reasons someone is not a fit for a job: the job-related rejection reasons, plus Other. */
export const DISMISS_REASONS = [
  'Does not meet minimum requirements',
  'Skills mismatch',
  'Experience mismatch',
  'Compensation mismatch',
  'Location or availability',
  'Other',
];

/** Hide people from a job's ranking, with a reason the team can see later. */
export function DismissModal({
  target,
  count,
  name,
  requisitionId,
  onClose,
}: {
  target: BulkTarget | null;
  count: number;
  name?: string;
  requisitionId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const bulk = useBulkCandidates(() => {
    setReason(null);
    setOther('');
    onClose();
  });
  const text = reason === 'Other' ? other.trim() : reason;
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={
        name
          ? `${name} is not a fit for this job`
          : `${count.toLocaleString()} people are not a fit for this job`
      }
      description="They are hidden from this job's ranking. Show dismissed brings them back."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!text}
            loading={bulk.isPending}
            onClick={() =>
              target && bulk.mutate({ ...target, action: 'dismiss', requisitionId, reason: text })
            }
          >
            Hide for this job
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <RadioGroup
          aria-label="Reason"
          value={reason}
          onValueChange={setReason}
          options={DISMISS_REASONS.map((value) => ({ value, label: value }))}
        />
        {reason === 'Other' && (
          <Textarea
            label="Reason"
            placeholder="Keep it about the job"
            value={other}
            onChange={(event) => setOther(event.currentTarget.value)}
            minRows={2}
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
}
