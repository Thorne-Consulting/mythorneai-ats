'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/api';
import { useCurrentUser } from '@/auth';
import { Button, FileDrop, Input, Modal, SearchSelect, TagsInput, toast } from '@/components/ui';
import type { RequisitionSummary, ResumeParsePreview } from '@/types';
import { useTagOptions } from './candidate-actions';
import { SourceFields } from '@/features/sources/SourceFields';

interface CandidateForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  linkedInUrl: string;
  source: string;
  referrerId: string | null;
  tags: string[];
}
type Duplicate = { id: string; name: string };

const INITIAL: CandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  currentTitle: '',
  linkedInUrl: '',
  source: 'Sourced',
  referrerId: null,
  tags: [],
};

function validate(values: CandidateForm) {
  const errors: Partial<Record<keyof CandidateForm, string>> = {};
  if (!values.firstName.trim()) errors.firstName = 'Enter a first name';
  if (!values.lastName.trim()) errors.lastName = 'Enter a last name';
  if (!/^\S+@\S+\.\S+$/.test(values.email))
    errors.email = 'Enter an email address, for example name@example.com';
  if (!values.source.trim()) errors.source = 'Choose where they came from';
  return errors;
}

/**
 * Add one person: optionally start from a resume (we read it to fill in the form, then keep it
 * as their resume), optionally put them straight into a job, then open their profile.
 */
export function CreateCandidateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CandidateForm>(INITIAL);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const jobs = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened,
  });
  const tagOptions = useTagOptions(opened);

  const reset = () => {
    setValues(INITIAL);
    setErrors({});
    setFile(null);
    setJobId(null);
    setDuplicate(null);
    read.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const attachResume = (candidateId: string) => {
    if (!file) return Promise.resolve();
    const body = new FormData();
    body.append('file', file);
    body.append('kind', 'Resume');
    return api.form(`/api/candidates/${candidateId}/attachments`, body);
  };
  const finish = (candidateId: string, message: string) => {
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
    toast.success(message, file ? 'We are reading the resume into the profile.' : undefined);
    close();
    router.push(`/candidates/${candidateId}`);
  };

  // With AI on, a dropped resume fills in the form; the file is kept as their resume either way.
  const read = useMutation({
    mutationFn: (resume: File) => {
      const data = new FormData();
      data.append('file', resume);
      return api.form<ResumeParsePreview>('/api/resumes/parse', data);
    },
    onSuccess: ({ form: { basics, work } }) => {
      // The resume lists the latest job first.
      const current = work[0];
      setValues((now) => ({
        ...now,
        firstName: basics.firstName ?? now.firstName,
        lastName: basics.lastName ?? now.lastName,
        email: basics.email ?? now.email,
        phone: basics.phone ?? now.phone,
        location: [basics.city, basics.region].filter(Boolean).join(', ') || now.location,
        currentTitle: current?.title ?? now.currentTitle,
      }));
    },
    onError: () =>
      toast(
        'We could not fill in the form from this resume',
        'Type the details. We still keep the file.',
      ),
  });
  const create = useMutation({
    mutationFn: async (body: CandidateForm) => {
      const { id } = await api.post<{ id: string }>('/api/candidates', body);
      await attachResume(id);
      if (jobId)
        await api.post('/api/candidates/bulk', {
          ids: [id],
          action: 'addToJob',
          requisitionId: jobId,
        });
      return id;
    },
    onSuccess: (id) => finish(id, `${values.firstName} ${values.lastName} was added`),
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        const found = (error.details as { candidate?: Duplicate } | undefined)?.candidate;
        setDuplicate(found ?? null);
        setErrors((current) => ({
          ...current,
          email: found
            ? `${found.name} already has this email.`
            : 'Someone already has this email.',
        }));
        return;
      }
      toast.error('Could not add the candidate', error.message);
    },
  });
  const attachToDuplicate = useMutation({
    mutationFn: (candidateId: string) => attachResume(candidateId).then(() => candidateId),
    onSuccess: (id) => finish(id, `Resume added to ${duplicate?.name}`),
    onError: (error: Error) => toast.error('Could not add the resume', error.message),
  });

  const field = (key: Exclude<keyof CandidateForm, 'tags' | 'source' | 'referrerId'>) => ({
    value: values[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setValues((current) => ({ ...current, [key]: value }));
      if (key === 'email') setDuplicate(null);
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate(values);
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Add candidate"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-candidate" loading={create.isPending}>
            Add candidate
          </Button>
        </>
      }
    >
      <form id="create-candidate" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FileDrop
          file={file}
          onFile={(next) => {
            setFile(next);
            read.reset();
            if (next && user.aiEnabled) read.mutate(next);
          }}
          accept=".pdf,.docx"
          label="Start from a resume (optional): drop it here, or click to choose"
          hint={
            user.aiEnabled
              ? 'PDF or Word document, up to 10 MB. We fill in the form from it.'
              : 'PDF or Word document, up to 10 MB. We keep it as their resume.'
          }
        />
        {read.isPending && (
          <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
            <Sparkles className="size-4 text-accent-foreground" aria-hidden />
            Reading the resume to fill in the form…
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required {...field('firstName')} />
          <Input label="Last name" required {...field('lastName')} />
          <div className="sm:col-span-2">
            <Input label="Email" type="email" required {...field('email')} />
            {duplicate && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/candidates/${duplicate.id}`)}
                >
                  Open {duplicate.name}
                </Button>
                {file && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={attachToDuplicate.isPending}
                    onClick={() => attachToDuplicate.mutate(duplicate.id)}
                  >
                    Add this resume to {duplicate.name}
                  </Button>
                )}
              </div>
            )}
          </div>
          <Input label="Phone" type="tel" {...field('phone')} />
          <Input label="Location" placeholder="For example, Chicago, IL" {...field('location')} />
          <Input label="Current title" {...field('currentTitle')} />
          <SourceFields
            enabled={opened}
            source={values.source || null}
            referrerId={values.referrerId}
            onChange={({ source, referrerId }) =>
              setValues((current) => ({ ...current, source: source ?? '', referrerId }))
            }
            error={errors.source}
          />
          <Input
            className="sm:col-span-2"
            label="LinkedIn profile link"
            type="url"
            placeholder="https://www.linkedin.com/in/…"
            {...field('linkedInUrl')}
          />
        </div>
        <TagsInput
          label="Tags"
          placeholder="Type a tag and press Enter"
          data={tagOptions.data?.map((item) => item.tag) ?? []}
          value={values.tags}
          onChange={(tags) => setValues((current) => ({ ...current, tags }))}
        />
        <SearchSelect
          label="Add to a job (optional)"
          placeholder="Search open jobs"
          value={jobId}
          onChange={setJobId}
          data={
            jobs.data?.map((job) => ({ value: job.id, label: `${job.title} · ${job.code}` })) ?? []
          }
        />
      </form>
    </Modal>
  );
}
