'use client';

import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Checkbox,
  MultiSelect,
  NumberInput,
  Radio,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { RequisitionWithSettings } from './requirements-types';

type DirectoryUser = { email: string; displayName: string; role: string };

const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
const EMPLOYMENT_TYPES = ['Full time', 'Part time', 'Contract', 'Internship', 'Temporary'];

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

  // The job's own fields. Text saves when you leave the field; choices save straight away.
  const savedDetails = {
    title: requisition.title,
    department: requisition.department,
    location: requisition.location,
    employmentType: requisition.employmentType,
    workMode: requisition.workMode,
    openings: requisition.openings,
    ownerEmail: requisition.ownerEmail,
    recruiterEmail: requisition.recruiterEmail,
    description: requisition.description ?? '',
    targetStartDate: requisition.targetStartDate?.slice(0, 10) ?? '',
  };
  type Details = typeof savedDetails;
  const [details, setDetails] = useState(savedDetails);
  const detailsKey = JSON.stringify(savedDetails);
  useEffect(() => setDetails(JSON.parse(detailsKey) as Details), [detailsKey]);
  const saveDetails = useMutation({
    mutationFn: (next: Details) =>
      api.put(`/api/requisitions/${requisition.id}`, {
        ...next,
        targetStartDate: next.targetStartDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: error.message }),
  });
  const saveDetailsIfChanged = (next: Details) => {
    if (JSON.stringify(next) !== detailsKey) saveDetails.mutate(next);
  };
  const changeDetails = (next: Details) => {
    setDetails(next);
    saveDetailsIfChanged(next);
  };
  const detailsStatus = saveDetails.isPending
    ? 'Saving…'
    : saveDetails.isError
      ? 'Not saved'
      : 'Saved';
  const text = (key: 'title' | 'department' | 'location' | 'description' | 'targetStartDate') => ({
    value: details[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDetails({ ...details, [key]: event.currentTarget.value }),
    onBlur: () => saveDetailsIfChanged(details),
  });
  const pick = (key: 'workMode' | 'employmentType') => ({
    value: details[key],
    allowDeselect: false,
    onChange: (value: string | null) => value && changeDetails({ ...details, [key]: value }),
  });
  const person = (key: 'ownerEmail' | 'recruiterEmail') => ({
    value: details[key],
    onChange: (value: string) => setDetails({ ...details, [key]: value }),
    onOptionSubmit: (value: string) => changeDetails({ ...details, [key]: value }),
    onBlur: () => saveDetailsIfChanged(details),
  });
  const people = (role: string) =>
    (directory.data ?? [])
      .filter((user) => user.role === role || user.role === 'Admin')
      .map((user) => ({ value: user.email, label: `${user.displayName} · ${user.email}` }));

  const visibilityControls = (
    <Stack gap="lg">
      <Radio.Group
        aria-label="Who can see this job"
        value={value.isConfidential ? 'confidential' : 'team'}
        onChange={(next) => change({ ...value, isConfidential: next === 'confidential' })}
      >
        <Stack gap="sm">
          <Radio value="team" label="Everyone who can see jobs" description="The usual setting." />
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
  );
  const selfServiceControls = (
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
  );
  const visibilityBlock = (
    <section className="settings-block">
      <div>
        <h2 className="settings-title">Who can see this job</h2>
        <p className="settings-copy">
          A confidential job is hidden from everyone except the owner, the recruiter and the people
          you add here.
        </p>
        <p className="settings-status" aria-live="polite">
          {status}
        </p>
      </div>
      {visibilityControls}
    </section>
  );
  const selfServiceBlock = (
    <section className="settings-block">
      <div>
        <h2 className="settings-title">Candidate self-service</h2>
        <p className="settings-copy">
          What candidates can do on their own, from the portal and the links in their emails.
        </p>
      </div>
      {selfServiceControls}
    </section>
  );

  return (
    <div className="settings-page">
      <section className="settings-block">
        <div>
          <h2 className="settings-title">The job</h2>
          <p className="settings-copy">
            What candidates and your team see. Changes show on the job page and posting.
          </p>
          <p className="settings-status" aria-live="polite">
            {detailsStatus}
          </p>
        </div>
        <div className="settings-fields">
          <TextInput className="settings-wide" label="Job title" {...text('title')} />
          <TextInput label="Team" {...text('department')} />
          <TextInput label="Location" {...text('location')} />
          <Select label="Work mode" data={WORK_MODES} {...pick('workMode')} />
          <Select label="Employment type" data={EMPLOYMENT_TYPES} {...pick('employmentType')} />
          <NumberInput
            label="Openings"
            min={1}
            value={details.openings}
            onChange={(openings) => setDetails({ ...details, openings: Number(openings) || 1 })}
            onBlur={() => saveDetailsIfChanged(details)}
          />
          <TextInput type="date" label="Target start" {...text('targetStartDate')} />
        </div>
      </section>
      <section className="settings-block">
        <div>
          <h2 className="settings-title">People</h2>
          <p className="settings-copy">Who owns the hire, and who runs the process.</p>
        </div>
        <div className="settings-fields">
          <Autocomplete
            label="Hiring manager"
            data={people('HiringManager')}
            {...person('ownerEmail')}
          />
          <Autocomplete
            label="Recruiter"
            data={people('Recruiter')}
            {...person('recruiterEmail')}
          />
        </div>
      </section>
      <section className="settings-block">
        <div>
          <h2 className="settings-title">About the role</h2>
          <p className="settings-copy">The summary shown on the Role tab.</p>
        </div>
        <Textarea autosize minRows={4} aria-label="About the role" {...text('description')} />
      </section>
      {visibilityBlock}
      {selfServiceBlock}
    </div>
  );
}
