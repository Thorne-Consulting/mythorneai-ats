'use client';

import { useState } from 'react';
import { Sparkles, Upload } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { Badge, Button, FileDrop, Input, Modal, toast } from '@/components/ui';
import type { ResumeParsePreview } from '@/types';

interface ImportForm {
  firstName: string;
  lastName: string;
  email: string;
  source: string;
}

const initialValues: ImportForm = {
  firstName: '',
  lastName: '',
  email: '',
  source: 'Resume import',
};

function validate(values: ImportForm) {
  const errors: Partial<Record<keyof ImportForm, string>> = {};
  if (!values.firstName.trim()) errors.firstName = 'Required';
  if (!values.lastName.trim()) errors.lastName = 'Required';
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Enter a valid email';
  if (!values.source.trim()) errors.source = 'Required';
  return errors;
}

// Only identity can be typed over here. Everything the resume says is parsed and stays read-only,
// so nobody can make a candidate look stronger than their resume.
export function ResumeImportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResumeParsePreview | null>(null);
  const [values, setValues] = useState<ImportForm>(initialValues);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const router = useRouter();
  const queryClient = useQueryClient();
  const parse = useMutation({
    mutationFn: async (resume: File) => {
      const data = new FormData();
      data.append('file', resume);
      return api.form<ResumeParsePreview>('/api/resumes/parse', data);
    },
    onSuccess: (result) => {
      setPreview(result);
      setValues({
        firstName: result.form.basics.firstName ?? '',
        lastName: result.form.basics.lastName ?? '',
        email: result.form.basics.email ?? '',
        source: 'Resume import',
      });
    },
    onError: (error: Error) => toast.error('Could not parse resume', error.message),
  });
  const importResume = useMutation({
    mutationFn: async (form: ImportForm) => {
      if (!file) throw new Error('Choose a resume first.');
      const data = new FormData();
      data.append('file', file);
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      return api.form<{ candidateId: string; candidateName: string }>('/api/resumes/import', data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['talent-search'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.success(`${result.candidateName} was added`);
      resetAndClose();
      router.push(`/candidates/${result.candidateId}`);
    },
    onError: (error: Error) => toast.error('Could not import resume', error.message),
  });

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setPreview(null);
    setValues(initialValues);
    setErrors({});
    parse.reset();
    if (nextFile) parse.mutate(nextFile);
  };
  const resetAndClose = () => {
    setFile(null);
    setPreview(null);
    setValues(initialValues);
    setErrors({});
    parse.reset();
    importResume.reset();
    onClose();
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) importResume.mutate(values);
  };
  const field = (key: keyof ImportForm) => ({
    value: values[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setValues((current) => ({ ...current, [key]: value }));
    },
  });
  const basics = preview?.form.basics;

  return (
    <Modal
      opened={opened}
      onClose={resetAndClose}
      title="Import a resume"
      description="Upload a PDF or DOCX. The resume is parsed into the candidate's profile; you only confirm who they are."
      size="lg"
      footer={
        <>
          <p className="mr-auto max-w-[430px] text-xs text-fg-subtle">
            Parsed data supports search and review. It never makes or recommends a hiring decision.
          </p>
          <Button variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="resume-import"
            leftIcon={<Upload />}
            disabled={!preview}
            loading={importResume.isPending}
          >
            Add candidate
          </Button>
        </>
      }
    >
      <form id="resume-import" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FileDrop
          file={file}
          onFile={chooseFile}
          accept=".pdf,.docx"
          label="Drop a resume here or browse"
        />
        {parse.isPending && (
          <div
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
            aria-live="polite"
          >
            <Sparkles className="size-[18px] text-tone-blue-dot" aria-hidden />
            <div>
              <p className="text-base font-semibold text-fg">Reading the resume</p>
              <p className="text-xs text-fg-subtle">
                Contact details, experience, education and skills.
              </p>
            </div>
          </div>
        )}
        {preview && basics && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-md font-semibold text-fg">Confirm the candidate</p>
                <p className="text-sm text-fg-subtle">
                  {[basics.city, basics.region].filter(Boolean).join(', ') || 'No location found'}
                  {basics.phone ? ` · ${basics.phone}` : ''}
                </p>
              </div>
              <Badge>
                {preview.form.work.length} jobs · {preview.form.education.length} schools ·{' '}
                {preview.form.skills.length} skills
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="First name" required {...field('firstName')} />
              <Input label="Last name" required {...field('lastName')} />
              <Input label="Email" type="email" required {...field('email')} />
              <Input label="Source" required {...field('source')} />
            </div>
            {preview.form.work.length > 0 && (
              <p className="text-sm text-fg">
                <b>Experience found:</b>{' '}
                {preview.form.work
                  .slice(0, 4)
                  .map((job) => `${job.title} at ${job.company}`)
                  .join('; ')}
              </p>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
