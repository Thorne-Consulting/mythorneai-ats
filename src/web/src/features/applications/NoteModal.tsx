'use client';

import { useState } from 'react';
import { Button, Group, Modal, Stack, Textarea } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import type { ModalProps } from './application-types';

export function NoteModal({
  applicationId,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string }) {
  const [body, setBody] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/applications/${applicationId}/notes`, { body, isPrivate: false }),
    onSuccess: () => {
      setBody('');
      onSaved();
      onClose();
    },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add review note">
      <Stack>
        <Textarea
          label="Job-related note"
          minRows={6}
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!body.trim()} onClick={() => mutation.mutate()}>
            Add note
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
