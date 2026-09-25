'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { ApplicantPage, ApplicationDetailResponse } from '@/types';

type Props = { opened: boolean; onClose: () => void; selectedDate: Date };

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ScheduleInterviewDrawer({ opened, onClose, selectedDate }: Props) {
  const queryClient = useQueryClient();
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [title, setTitle] = useState('Interview');
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [interviewers, setInterviewers] = useState('');

  useEffect(() => {
    if (!opened) return;
    const start = new Date(selectedDate);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);
    setStartsAt(localDateTime(start));
    setEndsAt(localDateTime(end));
  }, [opened, selectedDate]);

  const candidates = useQuery({
    queryKey: ['schedule-candidates'],
    queryFn: () =>
      api.get<ApplicantPage>('/api/applications?page=1&pageSize=100&sort=name&status=Active'),
    enabled: opened,
  });
  const application = useQuery({
    queryKey: ['schedule-application', applicationId],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${applicationId}`),
    enabled: Boolean(applicationId),
  });
  const selectedApplication = application.data?.application;
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/applications/${applicationId}/interviews`, {
        title,
        interviewKitId: kitId,
        startsAt: new Date(startsAt!).toISOString(),
        endsAt: new Date(endsAt!).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        interviewerEmails: interviewers
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean),
        meetingLink: null,
        status: 'Scheduled',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interview-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
      notifications.show({ color: 'teal', message: 'Interview scheduled' });
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const selectKit = (value: string | null) => {
    setKitId(value);
    const kit = selectedApplication?.interviewKits.find((item) => item.id === value);
    if (!kit) return;
    setTitle(kit.name);
    if (startsAt) {
      const end = new Date(startsAt);
      end.setMinutes(end.getMinutes() + kit.durationMinutes);
      setEndsAt(localDateTime(end));
    }
  };

  return (
    <Drawer opened={opened} onClose={onClose} title="Schedule interview" position="right" size="md">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Pick an active candidate, then choose a time. The event will sync to your configured
          calendar provider.
        </Text>
        <Select
          searchable
          label="Candidate"
          placeholder="Search active candidates"
          value={applicationId}
          onChange={(value) => {
            setApplicationId(value);
            setKitId(null);
          }}
          data={(candidates.data?.items ?? []).map((item) => ({
            value: item.id,
            label: `${item.candidateName} · ${item.requisitionTitle}`,
          }))}
          nothingFoundMessage="No active candidates found"
        />
        {selectedApplication && (
          <Text size="sm" c="dimmed">
            {selectedApplication.requisitionCode} · {selectedApplication.requisitionTitle}
          </Text>
        )}
        <Select
          label="Interview kit"
          placeholder={applicationId ? 'Choose a structured kit' : 'Choose a candidate first'}
          clearable
          disabled={!applicationId || application.isLoading}
          value={kitId}
          onChange={selectKit}
          data={(selectedApplication?.interviewKits ?? []).map((kit) => ({
            value: kit.id,
            label: `${kit.name} · ${kit.durationMinutes} min`,
          }))}
        />
        <TextInput
          label="Interview name"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateTimePicker
            label="Starts"
            value={startsAt}
            onChange={setStartsAt}
            clearable={false}
          />
          <DateTimePicker label="Ends" value={endsAt} onChange={setEndsAt} clearable={false} />
        </SimpleGrid>
        <TextInput
          label="Interviewers"
          description="Comma-separated work emails"
          placeholder="interviewer@example.com"
          value={interviewers}
          onChange={(event) => setInterviewers(event.currentTarget.value)}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!applicationId || !title || !startsAt || !endsAt || !interviewers}
            onClick={() => mutation.mutate()}
          >
            Schedule and sync
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
