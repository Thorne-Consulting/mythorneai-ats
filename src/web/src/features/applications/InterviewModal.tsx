'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, Select, toast } from '@/components/ui';
import type { InterviewKit } from '@/types';
import type { Interview, ModalProps } from './application-types';

export function InterviewModal({
  applicationId,
  interviewKits,
  interview,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string; interviewKits: InterviewKit[]; interview?: Interview }) {
  const [title, setTitle] = useState(interview?.title ?? 'Interview');
  const [kitId, setKitId] = useState<string | null>(interview?.interviewKitId ?? null);
  const [startsAt, setStartsAt] = useState(interview ? localDateTime(interview.startsAt) : '');
  const [endsAt, setEndsAt] = useState(interview ? localDateTime(interview.endsAt) : '');
  const [interviewers, setInterviewers] = useState(interview?.interviewerEmails.join(', ') ?? '');
  const [meetingLink, setMeetingLink] = useState(interview?.meetingLink ?? '');
  const payload = () => ({
    title,
    interviewKitId: kitId,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    meetingLink: meetingLink || null,
    interviewerEmails: interviewers
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    status: interview?.status ?? 'Scheduled',
  });
  const mutation = useMutation({
    mutationFn: () =>
      interview
        ? api.patch(`/api/interviews/${interview.id}`, payload())
        : api.post(`/api/applications/${applicationId}/interviews`, payload()),
    onSuccess: () => {
      onSaved();
      onClose();
      toast.success(interview ? 'Interview updated' : 'Interview scheduled');
    },
    onError: (error: Error) => toast.error('Could not save the interview', error.message),
  });
  const selectKit = (value: string | null) => {
    setKitId(value);
    const kit = interviewKits.find((item) => item.id === value);
    if (kit) setTitle(kit.name);
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={interview ? 'Edit interview' : 'Schedule interview'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title || !startsAt || !endsAt || !interviewers}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {interview ? 'Save and sync' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Interview kit"
          placeholder="Choose a structured kit"
          clearable
          value={kitId}
          onChange={selectKit}
          data={interviewKits.map((kit) => ({
            value: kit.id,
            label: `${kit.name} · ${kit.durationMinutes} min`,
          }))}
        />
        <Input
          label="Interview name"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="datetime-local"
            label="Starts"
            value={startsAt}
            onChange={(event) => setStartsAt(event.currentTarget.value)}
          />
          <Input
            type="datetime-local"
            label="Ends"
            value={endsAt}
            onChange={(event) => setEndsAt(event.currentTarget.value)}
          />
        </div>
        <Input
          label="Interviewers"
          description="Comma-separated work emails"
          value={interviewers}
          onChange={(event) => setInterviewers(event.currentTarget.value)}
        />
        <Input
          label="Meeting link"
          description="Leave blank to create Teams or Google Meet when configured."
          value={meetingLink}
          onChange={(event) => setMeetingLink(event.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
