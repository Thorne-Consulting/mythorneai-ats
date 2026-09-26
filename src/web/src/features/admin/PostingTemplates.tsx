'use client';

import {
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDisclosure } from '@mantine/hooks';
import { api } from '@/api';

type Template = {
  id: string;
  name: string;
  version: number;
  headerMarkdown: string;
  descriptionMarkdown: string;
  benefitsMarkdown: string;
  applicationQuestionsMarkdown: string;
  interviewStagesMarkdown: string;
};
type Form = Omit<Template, 'id' | 'version'>;

export function PostingTemplates() {
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<Template[]>('/api/posting-templates'),
  });
  const form = useForm<Form>({
    initialValues: {
      name: '',
      headerMarkdown: '',
      descriptionMarkdown: '',
      benefitsMarkdown: '',
      applicationQuestionsMarkdown: '',
      interviewStagesMarkdown: '',
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Required'),
      headerMarkdown: (value) => (value.trim() ? null : 'Required'),
      descriptionMarkdown: (value) => (value.trim() ? null : 'Required'),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Form) => api.post('/api/posting-templates', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-templates'] });
      form.reset();
      close();
      notifications.show({ color: 'teal', message: 'Template saved as a new version' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <>
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={3}>Posting templates</Title>
          <Text c="dimmed" size="sm">
            Reusable company-ready Markdown for new jobs.
          </Text>
        </div>
        <Button
          onClick={() => {
            form.reset();
            open();
          }}
        >
          New template
        </Button>
      </Group>
      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={520}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(templates.data ?? []).map((template) => (
                <Table.Tr key={template.id}>
                  <Table.Td>{template.name}</Table.Td>
                  <Table.Td>v{template.version}</Table.Td>
                  <Table.Td>Ready to use</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <Modal
        opened={opened}
        onClose={() => {
          form.reset();
          close();
        }}
        title="New posting template"
        size="lg"
      >
        <form onSubmit={form.onSubmit((values) => mutation.mutate(values))}>
          <Stack>
            <TextInput label="Template name" {...form.getInputProps('name')} />
            <Textarea
              label="Company header Markdown"
              minRows={3}
              {...form.getInputProps('headerMarkdown')}
            />
            <Textarea
              label="Role description Markdown"
              minRows={5}
              {...form.getInputProps('descriptionMarkdown')}
            />
            <Textarea
              label="Benefits and principles Markdown"
              minRows={4}
              {...form.getInputProps('benefitsMarkdown')}
            />
            <Textarea
              label="Default application questions Markdown"
              minRows={3}
              {...form.getInputProps('applicationQuestionsMarkdown')}
            />
            <Textarea
              label="Default interview stages Markdown"
              minRows={3}
              {...form.getInputProps('interviewStagesMarkdown')}
            />
            <Button type="submit" loading={mutation.isPending}>
              Save template
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
