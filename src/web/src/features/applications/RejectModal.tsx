'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Textarea } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import type { ModalProps } from './application-types';

export function RejectModal({
  applicationId,
  stageId,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string; stageId: string }) {
  const [reason, setReason] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const draftMutation = useMutation({
    mutationFn: () =>
      api.post<{ draft: string }>('/api/ai/draft-message', {
        applicationId,
        purpose: 'rejection message',
        notes: reason ?? '',
      }),
    onSuccess: (result) => setDraft(result.draft),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Rejected',
        dispositionReason: reason,
        message: draft || null,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Reject applicant">
      <Stack>
        <Select
          label="Disposition reason"
          value={reason}
          onChange={setReason}
          data={[
            'Does not meet minimum requirements',
            'Skills mismatch',
            'Experience mismatch',
            'Compensation mismatch',
            'Location or availability',
            'Withdrew',
            'Position closed',
            'Other',
          ]}
        />
        <Alert color="orange">
          Use job-related reasons only. This decision is recorded in the audit history.
        </Alert>
        <Button
          variant="light"
          loading={draftMutation.isPending}
          disabled={!reason}
          onClick={() => draftMutation.mutate()}
        >
          Draft candidate message with AI
        </Button>
        {draft && (
          <Textarea
            label="Review and edit before sending"
            minRows={6}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" disabled={!reason} onClick={() => mutation.mutate()}>
            Reject applicant
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
