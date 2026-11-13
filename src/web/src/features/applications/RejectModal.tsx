'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, Modal, Select, Textarea, toast } from '@/components/ui';
import { DISPOSITION_REASONS, type ModalProps } from './application-types';

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
    onError: (error: Error) => toast.error('Could not draft a message', error.message),
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
      toast.success('Applicant rejected');
    },
    onError: (error: Error) => toast.error('Could not reject this applicant', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Reject applicant"
      description="This is saved in the activity history."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reason}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Reject applicant
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Reason"
          placeholder="Choose a reason"
          value={reason}
          onChange={setReason}
          data={DISPOSITION_REASONS}
        />
        <Alert tone="warning">Use job-related reasons only.</Alert>
        <Button
          variant="soft"
          leftIcon={<Sparkles />}
          loading={draftMutation.isPending}
          disabled={!reason}
          onClick={() => draftMutation.mutate()}
        >
          Draft a message with AI
        </Button>
        {draft && (
          <Textarea
            label="Message to the candidate"
            description="Check and edit it before you send."
            minRows={6}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        )}
      </div>
    </Modal>
  );
}
