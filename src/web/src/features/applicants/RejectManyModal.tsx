'use client';

import { useState } from 'react';
import { Button, Modal, Select } from '@/components/ui';
import { DISPOSITION_REASONS } from '@/features/applications/application-types';

export function RejectManyModal({
  opened,
  onClose,
  loading,
  onReject,
  title = 'Reject selected applicants',
}: {
  opened: boolean;
  onClose: () => void;
  loading: boolean;
  onReject: (reason: string) => void;
  title?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      description="We save the same reason for every applicant you selected."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reason}
            loading={loading}
            onClick={() => reason && onReject(reason)}
          >
            Reject applicants
          </Button>
        </>
      }
    >
      <Select
        label="Reason"
        placeholder="Choose a reason"
        value={reason}
        onChange={setReason}
        data={DISPOSITION_REASONS}
      />
    </Modal>
  );
}
