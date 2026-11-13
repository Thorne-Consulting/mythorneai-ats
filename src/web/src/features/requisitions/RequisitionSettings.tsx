'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Autocomplete,
  Card,
  Checkbox,
  Input,
  MultiSelect,
  NumberInput,
  RadioGroup,
  Select,
  Textarea,
  toast,
} from '@/components/ui';
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
    onError: (error: Error) => toast.error('Could not save', error.message),
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
    onError: (error: Error) => toast.error('Could not save', error.message),
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
    onChange: (value: string | null) => value && changeDetails({ ...details, [key]: value }),
  });
  const person = (key: 'ownerEmail' | 'recruiterEmail') => ({
    value: details[key],
    onChange: (value: string) => setDetails({ ...details, [key]: value }),
    onOptionSubmit: (value: string) => changeDetails({ ...details, [key]: value }),
  });
  const people = (role: string) =>
    (directory.data ?? [])
      .filter((user) => user.role === role || user.role === 'Admin')
      .map((user) => ({ value: user.email, label: `${user.displayName} · ${user.email}` }));

  return (
    <div className="flex flex-col gap-5">
      <Block
        title="The job"
        copy="What candidates and your team see. Changes show on the job page and posting."
        status={detailsStatus}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input className="sm:col-span-2" label="Job title" {...text('title')} />
          <Input label="Team" {...text('department')} />
          <Input label="Location" {...text('location')} />
          <Select label="Work mode" data={WORK_MODES} {...pick('workMode')} />
          <Select label="Employment type" data={EMPLOYMENT_TYPES} {...pick('employmentType')} />
          <NumberInput
            label="Openings"
            min={1}
            value={details.openings}
            onValueChange={(openings) =>
              setDetails({ ...details, openings: Number(openings) || 1 })
            }
            onBlur={() => saveDetailsIfChanged(details)}
          />
          <Input type="date" label="Target start" {...text('targetStartDate')} />
        </div>
      </Block>
      <Block title="People" copy="Who owns the hire, and who runs the process.">
        {/* Typed emails save when you leave the field (blur bubbles from the input). */}
        <div className="grid gap-4 sm:grid-cols-2" onBlur={() => saveDetailsIfChanged(details)}>
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
      </Block>
      <Block title="About the role" copy="The summary shown on the Details tab.">
        <Textarea minRows={4} aria-label="About the role" {...text('description')} />
      </Block>
      <Block
        title="Who can see this job"
        copy="A confidential job is hidden from everyone except the owner, the recruiter and the people you add here."
        status={status}
      >
        <div className="flex flex-col gap-5">
          <RadioGroup
            aria-label="Who can see this job"
            value={value.isConfidential ? 'confidential' : 'team'}
            onValueChange={(next) => change({ ...value, isConfidential: next === 'confidential' })}
            options={[
              {
                value: 'team',
                label: 'Everyone who can see jobs',
                description: 'The usual setting.',
              },
              {
                value: 'confidential',
                label: 'Confidential',
                description: 'The owner, the recruiter and the people below.',
              },
            ]}
          />
          <MultiSelect
            label="Also give access to"
            description="Read access to the job and its applications."
            placeholder={value.viewerEmails.length ? '' : 'Search by name or email'}
            data={options}
            value={value.viewerEmails}
            onChange={(viewerEmails) => change({ ...value, viewerEmails })}
          />
        </div>
      </Block>
      <Block
        title="Candidate self-service"
        copy="What candidates can do on their own, from the portal and the links in their emails."
      >
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Reschedule or cancel their interview"
            checked={value.allowCandidateReschedule}
            onCheckedChange={(checked) => change({ ...value, allowCandidateReschedule: checked })}
          />
          <Checkbox
            label="Withdraw their application"
            checked={value.allowCandidateWithdraw}
            onCheckedChange={(checked) => change({ ...value, allowCandidateWithdraw: checked })}
          />
        </div>
      </Block>
    </div>
  );
}

/** One settings group: what it does on the left, the controls on the right. */
function Block({
  title,
  copy,
  status,
  children,
}: {
  title: string;
  copy: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{copy}</p>
        {status && (
          <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">
            {status}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}
