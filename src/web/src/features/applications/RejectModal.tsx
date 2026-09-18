'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack } from '@mantine/core';
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
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Rejected',
        dispositionReason: reason,
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
