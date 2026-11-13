'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Modal, Textarea, toast } from '@/components/ui';
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
    onError: (error: Error) => toast.error('Could not add the note', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add review note"
      description="Only the hiring team sees notes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!body.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Add note
          </Button>
        </>
      }
    >
      <Textarea
        label="Job-related note"
        minRows={6}
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
      />
    </Modal>
  );
}
