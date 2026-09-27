'use client';

import { useState } from 'react';
import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { api } from '@/api';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { markdownSections } from '@/lib/markdown-sections';

const starterDocument = `# Company header

Introduce the company and why this role matters.

# Role description

Describe what this person will own.

# Benefits and principles

What should candidates know about working here?

# Application questions

Add any default questions for applicants.

# Interview stages

Describe the usual interview process.`;

export function PostingTemplateEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [content, setContent] = useState(starterDocument);
  const sections = markdownSections(content);
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/posting-templates', {
        name,
        headerMarkdown: sections['company header'] ?? '',
        descriptionMarkdown: sections['role description'] ?? '',
        benefitsMarkdown: sections['benefits and principles'] ?? '',
        applicationQuestionsMarkdown: sections['application questions'] ?? '',
        interviewStagesMarkdown: sections['interview stages'] ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-templates'] });
      notifications.show({ color: 'teal', message: 'Template saved as a new version' });
      router.push('/admin/templates');
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not save template',
        message: error.message,
      }),
  });

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
            Back to templates
          </Button>
          <Title order={1} mt="xs">
            New posting template
          </Title>
          <Text c="dimmed" size="sm">
            Build reusable, portable Markdown for job listings.
          </Text>
        </div>
        <Button
          loading={mutation.isPending}
          disabled={!name.trim() || !sections['company header'] || !sections['role description']}
          onClick={() => mutation.mutate()}
        >
          Save template
        </Button>
      </Group>
      <TextInput
        label="Template name"
        placeholder="Engineering standard"
        required
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <section>
        <Title order={3}>Template content</Title>
        <Text size="sm" c="dimmed" mb="xs">
          Keep the section headings. They place each part of this document in the right part of a
          job.
        </Text>
        <PlateMarkdownEditor
          value={content}
          onChange={setContent}
          placeholder="Write the template…"
        />
      </section>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          loading={mutation.isPending}
          disabled={!name.trim() || !sections['company header'] || !sections['role description']}
          onClick={() => mutation.mutate()}
        >
          Save template
        </Button>
      </Group>
    </Stack>
  );
}
