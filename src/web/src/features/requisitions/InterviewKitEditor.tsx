'use client';

import { useState } from 'react';
import { Button, Group, NumberInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { api } from '@/api';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { markdownSections } from '@/lib/markdown-sections';

const starterDocument = `# Interviewer instructions

Explain what the interviewer should focus on.

# Candidate booking message

Please choose an interview time from the available options.

# Interviewer assignment message

You are assigned to this interview. Please complete your scorecard afterward.

# Scorecard criteria

Role expertise | Tell me about the most relevant work you have done for this role. | Gives specific examples and explains personal contribution. | 3
Problem solving | Walk me through a difficult problem and the tradeoffs you made. | Frames the problem, considers alternatives, and measures the result. | 3
Collaboration | Describe a disagreement with a teammate and how you handled it. | Listens, communicates directly, and reaches a constructive outcome. | 2`;

export function InterviewKitEditor({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number | string>(60);
  const [content, setContent] = useState(starterDocument);
  const sections = markdownSections(content);
  const criteriaText = sections['scorecard criteria'] ?? '';
  const criteria = criteriaText
    .split('\n')
    .map((line) => {
      const [criterionName, question, description, weight] = line.split('|');
      return {
        name: criterionName?.trim() ?? '',
        question: question?.trim() ?? '',
        description: description?.trim() ?? '',
        weight: Math.min(5, Math.max(1, Number(weight?.trim()) || 1)),
      };
    })
    .filter((criterion) => criterion.name && criterion.question);
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${requisitionId}/interview-kits`, {
        name,
        durationMinutes: Number(duration),
        instructions: sections['interviewer instructions'] ?? '',
        candidateMessage: sections['candidate booking message'] ?? '',
        interviewerMessage: sections['interviewer assignment message'] ?? '',
        criteria,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      notifications.show({ color: 'teal', message: 'Interview kit created' });
      router.push(`/requisitions/${requisitionId}/kits`);
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not create kit', message: error.message }),
  });
  const canSubmit =
    name.trim() && criteria.length > 0 && Number(duration) >= 15 && Number(duration) <= 480;

  return (
    <Stack maw={1280} mx="auto" gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => router.back()}
            px={0}
          >
            Back to interview kits
          </Button>
          <Title order={1} mt="xs">
            New interview kit
          </Title>
          <Text c="dimmed" size="sm">
            Define the round once so every interviewer gets the same preparation and scorecard.
          </Text>
        </div>
        <Button
          loading={mutation.isPending}
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          Create kit
        </Button>
      </Group>

      <Stack gap="lg">
        <Group grow align="flex-start">
          <TextInput
            label="Interview name"
            placeholder="Technical interview"
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <NumberInput
            label="Duration in minutes"
            min={15}
            max={480}
            step={15}
            value={duration}
            onChange={setDuration}
          />
        </Group>
        <section>
          <Title order={3}>Kit content</Title>
          <Text size="sm" c="dimmed" mb="xs">
            Keep the section headings. Scorecard criteria use one line per competency: name |
            question | scoring guidance | weight (1–5).
          </Text>
          <PlateMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write this interview kit…"
          />
        </section>
      </Stack>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          loading={mutation.isPending}
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          Create kit
        </Button>
      </Group>
    </Stack>
  );
}
