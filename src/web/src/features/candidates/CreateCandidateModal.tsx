'use client';

import { Button, Group, Modal, SimpleGrid, Stack, TagsInput, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

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

export function CreateCandidateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CandidateForm>({
    initialValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: '',
      currentTitle: '',
      linkedInUrl: '',
      source: 'Direct applicant',
      tags: [],
    },
    validate: {
      firstName: (value) => (value.trim() ? null : 'Required'),
      lastName: (value) => (value.trim() ? null : 'Required'),
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'Enter a valid email'),
      source: (value) => (value.trim() ? null : 'Required'),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: CandidateForm) => api.post<{ id: string }>('/api/candidates', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      notifications.show({ color: 'teal', message: 'Candidate added' });
      form.reset();
      onClose();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not add candidate',
        message: error.message,
      }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Add candidate" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="First name" required {...form.getInputProps('firstName')} />
            <TextInput label="Last name" required {...form.getInputProps('lastName')} />
            <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
            <TextInput label="Phone" {...form.getInputProps('phone')} />
            <TextInput label="Current title" {...form.getInputProps('currentTitle')} />
            <TextInput label="Location" {...form.getInputProps('location')} />
            <TextInput
              label="Source"
              required
              placeholder="Referral, LinkedIn, direct…"
              {...form.getInputProps('source')}
            />
            <TextInput label="LinkedIn URL" {...form.getInputProps('linkedInUrl')} />
          </SimpleGrid>
          <TagsInput
            label="Tags"
            placeholder="Type and press enter"
            {...form.getInputProps('tags')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Add candidate
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
