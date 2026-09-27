'use client';

import { useState } from 'react';
import {
  Autocomplete,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { api } from '@/api';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';

interface RequisitionForm {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number;
  ownerEmail: string;
  recruiterEmail: string;
  targetStartDate: string;
}

type DirectoryUser = { email: string; displayName: string; role: string };
type PostingTemplate = { id: string; name: string; version: number; descriptionMarkdown: string };

export function CreateRequisitionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [postingTemplateId, setPostingTemplateId] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const form = useForm<RequisitionForm>({
    initialValues: {
      title: '',
      department: '',
      location: '',
      employmentType: 'Full time',
      workMode: 'Hybrid',
      openings: 1,
      ownerEmail: '',
      recruiterEmail: '',
      targetStartDate: '',
    },
    validate: {
      title: (value) => (value.trim() ? null : 'Required'),
      department: (value) => (value.trim() ? null : 'Required'),
      location: (value) => (value.trim() ? null : 'Required'),
      openings: (value) => (value >= 1 ? null : 'At least one opening'),
      ownerEmail: (value) => (value.includes('@') ? null : 'Enter an email or choose a person'),
      recruiterEmail: (value) => (value.includes('@') ? null : 'Enter an email or choose a person'),
    },
  });
  const directory = useQuery({
    queryKey: ['directory-users'],
    queryFn: () => api.get<DirectoryUser[]>('/api/directory/users'),
  });
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<PostingTemplate[]>('/api/posting-templates'),
  });
  const mutation = useMutation({
    mutationFn: (values: RequisitionForm) =>
      api.post<{ id: string }>('/api/requisitions', {
        ...values,
        description,
        postingTemplateId,
        targetStartDate: values.targetStartDate || null,
      }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job created' });
      router.push(`/requisitions/${id}`);
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not create job', message: error.message }),
  });
  const people = (role: string) =>
    (directory.data ?? [])
      .filter((person) => person.role === role || person.role === 'Admin')
      .map((person) => ({ value: person.email, label: `${person.displayName} · ${person.email}` }));

  return (
    <Stack maw={1080} mx="auto" gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => router.back()}
            px={0}
          >
            Back to jobs
          </Button>
          <Title order={1} mt="xs">
            New job
          </Title>
          <Text c="dimmed" size="sm">
            Set up the role, owners, and the candidate-facing summary.
          </Text>
        </div>
        <Button
          loading={mutation.isPending}
          onClick={() => form.onSubmit((values) => mutation.mutate(values))()}
        >
          Create job
        </Button>
      </Group>

      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
            <NumberInput
              label="Openings"
              min={1}
              allowDecimal={false}
              {...form.getInputProps('openings')}
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
            <TextInput
              type="date"
              label="Target start"
              {...form.getInputProps('targetStartDate')}
            />
            <Autocomplete
              label="Hiring manager"
              placeholder="Search or type an email"
              data={people('HiringManager')}
              {...form.getInputProps('ownerEmail')}
            />
            <Autocomplete
              label="Recruiter"
              placeholder="Search or type an email"
              data={people('Recruiter')}
              {...form.getInputProps('recruiterEmail')}
            />
          </SimpleGrid>

          <Stack gap="xs">
            <div>
              <Title order={3}>Role summary</Title>
              <Text size="sm" c="dimmed">
                Use headings, lists, emphasis, and quotes. The saved content remains Markdown.
              </Text>
            </div>
            <PlateMarkdownEditor
              key={editorVersion}
              value={description}
              onChange={setDescription}
              placeholder="Describe what this person will own…"
              header={
                <Select
                  size="xs"
                  w={240}
                  clearable
                  searchable
                  placeholder="Add from template"
                  value={postingTemplateId}
                  data={(templates.data ?? []).map((template) => ({
                    value: template.id,
                    label: `${template.name} · v${template.version}`,
                  }))}
                  onChange={(id) => {
                    setPostingTemplateId(id);
                    const template = templates.data?.find((item) => item.id === id);
                    if (template) {
                      setDescription(template.descriptionMarkdown);
                      setEditorVersion((version) => version + 1);
                    }
                  }}
                />
              }
            />
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create job
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
