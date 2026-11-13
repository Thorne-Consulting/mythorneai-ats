'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Input, SearchSelect, Select, toast } from '@/components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { ApplicationDetailResponse, CandidateListPage } from '@/types';

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
  const [status, setStatus] = useState('Scheduled');

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
      api.get<CandidateListPage>('/api/candidates?page=1&pageSize=100&sort=name&status=Active'),
    enabled: opened,
  });
  const application = useQuery({
    queryKey: ['schedule-application', applicationId],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${applicationId}`),
    enabled: Boolean(applicationId),
  });
  const selectedApplication = application.data?.application;
  const interviewerEmails = interviewers
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  const availability = useQuery({
    queryKey: ['interview-availability', interviewerEmails, startsAt, endsAt],
    queryFn: async () => {
      const start = new Date(startsAt!);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const durationMinutes = Math.max(
        15,
        Math.round((new Date(endsAt!).getTime() - new Date(startsAt!).getTime()) / 60_000),
      );
      const params = new URLSearchParams({
        interviewerEmails: interviewerEmails.join(','),
        from: start.toISOString(),
        to: end.toISOString(),
        durationMinutes: String(durationMinutes),
        slotIntervalMinutes: '30',
      });
      return api.get<{
        slots: Array<{ startsAt: string; endsAt: string }>;
        missingConnections: string[];
      }>(`/api/calendar/availability?${params}`);
    },
    enabled: interviewerEmails.length > 0 && Boolean(startsAt && endsAt),
  });
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
        status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interview-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
      toast.success(
        status === 'Proposed' ? 'Time offered to the candidate' : 'Interview scheduled',
      );
      onClose();
    },
    onError: (error: Error) => toast.error('Could not schedule the interview', error.message),
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

  const candidateOptions =
    // Each active application is its own choice: a person in two jobs appears twice.
    (candidates.data?.items ?? []).flatMap((person) =>
      person.applications
        .filter((app) => app.status === 'Active')
        .map((app) => ({ value: app.id, label: `${person.name} · ${app.requisitionTitle}` })),
    );
  const slots = availability.data?.slots ?? [];

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Schedule interview"
      description="Choose a candidate and a time. We add the interview to your calendar."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!applicationId || !title || !startsAt || !endsAt || !interviewers}
            onClick={() => mutation.mutate()}
          >
            {status === 'Proposed' ? 'Offer this time' : 'Schedule interview'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchSelect
          label="Candidate"
          placeholder={
            candidates.isLoading
              ? 'Loading candidates…'
              : candidateOptions.length
                ? 'Choose an active candidate'
                : 'No active candidates found'
          }
          disabled={!candidateOptions.length}
          value={applicationId}
          onChange={(value) => {
            setApplicationId(value);
            setKitId(null);
          }}
          data={candidateOptions}
        />
        <Select
          inset
          label="Interview kit"
          placeholder={applicationId ? 'Choose a kit' : 'Choose a candidate first'}
          clearable
          disabled={!applicationId || application.isLoading}
          value={kitId}
          onChange={selectKit}
          data={(selectedApplication?.interviewKits ?? []).map((kit) => ({
            value: kit.id,
            label: `${kit.name} · ${kit.durationMinutes} min`,
          }))}
        />
        <Input
          inset
          label="Interview name"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Select
          inset
          label="How to book"
          value={status}
          onChange={(value) => value && setStatus(value)}
          data={[
            { value: 'Scheduled', label: 'Book this time now' },
            { value: 'Proposed', label: 'Let the candidate confirm this time' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            inset
            type="datetime-local"
            label="Starts"
            required
            value={startsAt ?? ''}
            onChange={(event) => setStartsAt(event.currentTarget.value || null)}
          />
          <Input
            inset
            type="datetime-local"
            label="Ends"
            required
            min={startsAt ?? undefined}
            value={endsAt ?? ''}
            onChange={(event) => setEndsAt(event.currentTarget.value || null)}
          />
        </div>
        <Input
          inset
          label="Interviewers"
          description="Work emails, separated by commas"
          placeholder="interviewer@example.com"
          value={interviewers}
          onChange={(event) => setInterviewers(event.currentTarget.value)}
        />
        {availability.data?.missingConnections.length ? (
          <Alert tone="warning" title="Some calendars aren’t connected">
            We can only find times when everyone is free after these interviewers connect a
            calendar: {availability.data.missingConnections.join(', ')}
          </Alert>
        ) : null}
        <Select
          inset
          label="Times when everyone is free"
          placeholder={
            availability.isFetching
              ? 'Checking calendars…'
              : interviewerEmails.length === 0
                ? 'Add interviewers first'
                : slots.length
                  ? 'Choose a time'
                  : 'No time works for everyone'
          }
          disabled={availability.isFetching || !slots.length}
          value={null}
          data={slots.map((slot) => ({
            value: slot.startsAt,
            label: `${new Date(slot.startsAt).toLocaleString()} – ${new Date(slot.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
          }))}
          onChange={(value) => {
            const slot = slots.find((item) => item.startsAt === value);
            if (!slot) return;
            setStartsAt(localDateTime(new Date(slot.startsAt)));
            setEndsAt(localDateTime(new Date(slot.endsAt)));
          }}
        />
      </div>
    </Drawer>
  );
}
