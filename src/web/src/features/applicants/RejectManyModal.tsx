'use client';

import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';

export function RejectManyModal({
  opened,
  onClose,
  loading,
  onReject,
}: {
  opened: boolean;
  onClose: () => void;
  loading: boolean;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <Modal opened={opened} onClose={onClose} title="Reject selected applicants">
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
        <Text size="sm" c="dimmed">
          The same job-related reason is recorded for each selected applicant.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!reason}
            loading={loading}
            onClick={() => reason && onReject(reason)}
          >
            Reject applicants
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
