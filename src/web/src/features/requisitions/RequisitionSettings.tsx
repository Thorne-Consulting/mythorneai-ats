'use client';

import { useEffect, useState } from 'react';
import { Checkbox, MultiSelect, Radio, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
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
    mutationFn: (next: typeof value) =>
      api.put(`/api/requisitions/${requisition.id}/settings`, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  // Every change saves straight away; there is no Save button.
  const change = (next: typeof value) => {
    setValue(next);
    save.mutate(next);
  };
  const status = save.isPending ? 'Saving…' : save.isError ? 'Not saved' : 'Saved';

  return (
    <div className="settings-page">
      <section className="settings-block">
        <div>
          <h2 className="settings-title">Who can see this job</h2>
          <p className="settings-copy">
            A confidential job is hidden from everyone except the owner, the recruiter and the
            people you add here.
          </p>
          <p className="settings-status" aria-live="polite">
            {status}
          </p>
        </div>
        <Stack gap="lg">
          <Radio.Group
            aria-label="Who can see this job"
            value={value.isConfidential ? 'confidential' : 'team'}
            onChange={(next) => change({ ...value, isConfidential: next === 'confidential' })}
          >
            <Stack gap="sm">
              <Radio
                value="team"
                label="Everyone who can see jobs"
                description="The usual setting."
              />
              <Radio
                value="confidential"
                label="Confidential"
                description="The owner, the recruiter and the people below."
              />
            </Stack>
          </Radio.Group>
          <MultiSelect
            label="Also give access to"
            description="Read access to the job and its applications."
            placeholder={value.viewerEmails.length ? '' : 'Search by name or email'}
            searchable
            data={options}
            value={value.viewerEmails}
            onChange={(viewerEmails) => change({ ...value, viewerEmails })}
          />
        </Stack>
      </section>
      <section className="settings-block">
        <div>
          <h2 className="settings-title">Candidate self-service</h2>
          <p className="settings-copy">
            What candidates can do on their own, from the portal and the links in their emails.
          </p>
        </div>
        <Stack gap="md">
          <Checkbox
            label="Reschedule or cancel their interview"
            checked={value.allowCandidateReschedule}
            onChange={(event) =>
              change({ ...value, allowCandidateReschedule: event.currentTarget.checked })
            }
          />
          <Checkbox
            label="Withdraw their application"
            checked={value.allowCandidateWithdraw}
            onChange={(event) =>
              change({ ...value, allowCandidateWithdraw: event.currentTarget.checked })
            }
          />
        </Stack>
      </section>
    </div>
  );
}
