'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, TagsInput, toast } from '@/components/ui';

interface CandidateForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  linkedInUrl: string;
  source: string;
  tags: string[];
}

const INITIAL: CandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  currentTitle: '',
  linkedInUrl: '',
  source: 'Direct applicant',
  tags: [],
};

function validate(values: CandidateForm) {
  const errors: Partial<Record<keyof CandidateForm, string>> = {};
  if (!values.firstName.trim()) errors.firstName = 'Enter a first name';
  if (!values.lastName.trim()) errors.lastName = 'Enter a last name';
  if (!/^\S+@\S+\.\S+$/.test(values.email))
    errors.email = 'Enter an email address, for example name@example.com';
  if (!values.source.trim()) errors.source = 'Enter where they came from';
  return errors;
}

export function CreateCandidateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CandidateForm>(INITIAL);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const mutation = useMutation({
    mutationFn: (body: CandidateForm) => api.post<{ id: string }>('/api/candidates', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.success('Candidate added');
      setValues(INITIAL);
      setErrors({});
      onClose();
    },
    onError: (error: Error) => toast.error('Could not add the candidate', error.message),
  });
  const field = (key: Exclude<keyof CandidateForm, 'tags'>) => ({
    value: values[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setValues((current) => ({ ...current, [key]: value }));
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length === 0) mutation.mutate(values);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add candidate"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-candidate" loading={mutation.isPending}>
            Add candidate
          </Button>
        </>
      }
    >
      <form id="create-candidate" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required {...field('firstName')} />
          <Input label="Last name" required {...field('lastName')} />
          <Input label="Email" type="email" required {...field('email')} />
          <Input label="Phone" {...field('phone')} />
          <Input label="Current title" {...field('currentTitle')} />
          <Input label="Location" {...field('location')} />
          <Input
            label="Source"
            required
            placeholder="For example, Referral or LinkedIn"
            {...field('source')}
          />
          <Input label="LinkedIn profile link" {...field('linkedInUrl')} />
        </div>
        <TagsInput
          label="Tags"
          placeholder="Type a tag and press Enter"

          value={values.tags}
          onChange={(tags) => setValues((current) => ({ ...current, tags }))}
        />
      </form>
    </Modal>
  );
}
