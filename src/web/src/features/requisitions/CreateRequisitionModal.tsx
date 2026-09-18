'use client';

import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

interface RequisitionForm {
  code: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number;
  ownerEmail: string;
  recruiterEmail: string;
  description: string;
  targetStartDate: string;
}

export function CreateRequisitionModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<RequisitionForm>({
    initialValues: {
      code: '',
      title: '',
      department: '',
      location: '',
      employmentType: 'Full time',
      workMode: 'Hybrid',
      openings: 1,
      ownerEmail: '',
      recruiterEmail: '',
      description: '',
      targetStartDate: '',
    },
    validate: {
      code: (value) => (value.trim() ? null : 'Required'),
      title: (value) => (value.trim() ? null : 'Required'),
      department: (value) => (value.trim() ? null : 'Required'),
      location: (value) => (value.trim() ? null : 'Required'),
      openings: (value) => (value >= 1 ? null : 'At least one opening'),
      ownerEmail: (value) => (value.includes('@') ? null : 'Enter an email'),
      recruiterEmail: (value) => (value.includes('@') ? null : 'Enter an email'),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: RequisitionForm) =>
      api.post<{ id: string }>('/api/requisitions', {
        ...values,
        targetStartDate: values.targetStartDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job created' });
      form.reset();
      onClose();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not create job',
        message: error.message,
      }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New job" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label="Job code"
              placeholder="ENG-105"
              required
              {...form.getInputProps('code')}
            />
            <TextInput
              label="Job title"
              placeholder="Product designer"
              required
              {...form.getInputProps('title')}
            />
            <TextInput
              label="Team"
              placeholder="Engineering, sales, operations…"
              required
              {...form.getInputProps('department')}
            />
            <TextInput
              label="Location"
              placeholder="Chicago, IL"
              required
              {...form.getInputProps('location')}
            />
            <Select
              label="Employment type"
              data={['Full time', 'Part time', 'Contract', 'Internship', 'Temporary']}
              {...form.getInputProps('employmentType')}
            />
            <Select
              label="Work mode"
              data={['On-site', 'Hybrid', 'Remote']}
              {...form.getInputProps('workMode')}
            />
            <NumberInput
              label="Openings"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('openings')}
            />
            <TextInput
              type="date"
              label="Target start"
              {...form.getInputProps('targetStartDate')}
            />
            <TextInput
              label="Hiring manager email"
              required
              {...form.getInputProps('ownerEmail')}
            />
            <TextInput label="Recruiter email" required {...form.getInputProps('recruiterEmail')} />
          </SimpleGrid>
          <Textarea
            label="Role summary"
            minRows={4}
            placeholder="What will this person own?"
            {...form.getInputProps('description')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create draft
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
