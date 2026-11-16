'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Modal, SearchSelect } from '@/components/ui';
import type { Recipient } from './inbox-data';

/**
 * Start a conversation: pick the candidate and the job it is about, then write in the thread,
 * which has the full composer. People with two applications appear once per job.
 */
export function NewMessageModal({
  opened,
  onClose,
  onChoose,
}: {
  opened: boolean;
  onClose: () => void;
  onChoose: (applicationId: string) => void;
}) {
  const [to, setTo] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const recipients = useQuery({
    queryKey: ['inbox-recipients'],
    queryFn: () => api.get<Recipient[]>('/api/inbox/recipients'),
    enabled: opened,
  });
  const close = () => {
    setTo(null);
    setSubmitted(false);
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="New message"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setSubmitted(true);
              if (!to) return;
              onChoose(to);
              setTo(null);
              setSubmitted(false);
            }}
          >
            Write message
          </Button>
        </>
      }
    >
      <SearchSelect
        label="To"
        description="Type a name, an email or a job."
        placeholder={recipients.isLoading ? 'Loading candidates…' : 'Choose a candidate'}
        value={to}
        onChange={setTo}
        nothingFound="No open applications match"
        data={(recipients.data ?? []).map((r) => ({
          value: r.applicationId,
          label: `${r.candidateName} · ${r.jobTitle}`,
          group: r.stage,
        }))}
        error={submitted && !to ? 'Choose who to write to' : undefined}
      />
    </Modal>
  );
}
