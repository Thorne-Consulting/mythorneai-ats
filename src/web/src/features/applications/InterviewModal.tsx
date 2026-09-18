'use client';

import { useState } from 'react';
import { Button, Group, Modal, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
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
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
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
    >
      <Stack>
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
        <TextInput
          label="Interview name"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            type="datetime-local"
            label="Starts"
            value={startsAt}
            onChange={(event) => setStartsAt(event.currentTarget.value)}
          />
          <TextInput
            type="datetime-local"
            label="Ends"
            value={endsAt}
            onChange={(event) => setEndsAt(event.currentTarget.value)}
          />
        </SimpleGrid>
        <TextInput
          label="Interviewers"
          description="Comma-separated work emails"
          value={interviewers}
          onChange={(event) => setInterviewers(event.currentTarget.value)}
        />
        <TextInput
          label="Meeting link"
          description="Leave blank to create Teams or Google Meet when configured."
          value={meetingLink}
          onChange={(event) => setMeetingLink(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title || !startsAt || !endsAt || !interviewers}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {interview ? 'Save and sync' : 'Schedule'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
