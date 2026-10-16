'use client';

import { useEffect, useState } from 'react';
import { Button, Group, MultiSelect, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import type { RequisitionWithSettings } from './requirements-types';

type DirectoryUser = { email: string; displayName: string; role: string };

export function RequisitionSettings({ requisition }: { requisition: RequisitionWithSettings }) {
  const queryClient = useQueryClient();
  const initial = {
    isConfidential: requisition.isConfidential ?? false,
    viewerEmails: requisition.viewerEmails ?? [],
    allowCandidateReschedule: requisition.allowCandidateReschedule ?? false,
    allowCandidateWithdraw: requisition.allowCandidateWithdraw ?? false,
  };
  const [value, setValue] = useState(initial);
  const key = JSON.stringify(initial);
  useEffect(() => setValue(JSON.parse(key) as typeof initial), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(value) !== key;

  const directory = useQuery({
    queryKey: ['directory-users'],
    queryFn: () => api.get<DirectoryUser[]>('/api/directory/users'),
  });
  // Keep emails that are already saved even if they are no longer in the directory.
  const options = [
    ...(directory.data ?? []).map((user) => ({
      value: user.email,
      label: `${user.displayName} (${user.email})`,
    })),
    ...value.viewerEmails
      .filter((email) => !directory.data?.some((user) => user.email === email))
      .map((email) => ({ value: email, label: email })),
  ];

  const save = useMutation({
    mutationFn: () => api.put(`/api/requisitions/${requisition.id}/settings`, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job settings saved' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  return (
    <SectionCard
      title="Visibility and candidate self-service"
      description="Who can see this job, and what candidates can do themselves."
      padded
    >
      <Stack gap="md">
        <Switch
          label="Confidential job"
          description="Only the owner, recruiter and the people named below can see this job and its applications."
          checked={value.isConfidential}
          onChange={(event) => setValue({ ...value, isConfidential: event.currentTarget.checked })}
        />
        <MultiSelect
          label="People who can also see this job"
          description="Pick teammates by name. They get read access."
          placeholder="Search by name or email"
          searchable
          clearable
          data={options}
          value={value.viewerEmails}
          onChange={(viewerEmails) => setValue({ ...value, viewerEmails })}
        />
        <Switch
          label="Candidates can reschedule or cancel their interview"
          description="They manage it from the candidate portal."
          checked={value.allowCandidateReschedule}
          onChange={(event) =>
            setValue({ ...value, allowCandidateReschedule: event.currentTarget.checked })
          }
        />
        <Switch
          label="Candidates can withdraw their application"
          description="They use the link in their emails and portal."
          checked={value.allowCandidateWithdraw}
          onChange={(event) =>
            setValue({ ...value, allowCandidateWithdraw: event.currentTarget.checked })
          }
        />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </Text>
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
