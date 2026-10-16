'use client';

import { useState } from 'react';
import { Button, NumberInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { kitTemplates, parseKit } from './interview-kit-doc';

/** A new interview kit, written as one document. Type # for templates. */
export function InterviewKitEditor({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState<number | string>(60);
  const [content, setContent] = useState('');
  const kit = parseKit(content);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${requisitionId}/interview-kits`, {
        name: kit.name,
        durationMinutes: Number(duration),
        instructions: kit.instructions,
        candidateMessage: kit.candidateMessage,
        interviewerMessage: kit.interviewerMessage,
        criteria: kit.criteria,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      notifications.show({ color: 'teal', message: 'Interview kit created' });
      router.push(`/requisitions/${requisitionId}/kits`);
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not create kit', message: error.message }),
  });

  const durationOk = Number(duration) >= 15 && Number(duration) <= 480;
  const checks = [
    { label: 'A title', done: Boolean(kit.name) },
    { label: 'A duration', done: durationOk },
    { label: 'At least one competency', done: kit.criteria.length > 0 },
  ];
  const ready = checks.every((item) => item.done);

  return (
    <article className="kit-doc">
      <aside className="kit-rail" aria-label="Create this kit">
        <p className="kit-rail-title">Before you create</p>
        <NumberInput
          label="Duration"
          min={15}
          max={480}
          step={15}
          suffix=" min"
          value={duration}
          onChange={setDuration}
          error={!durationOk || undefined}
          className="kit-rail-duration"
          size="sm"
        />
        <ul className="kit-rail-list">
          {checks.map((item) => (
            <li key={item.label} data-done={item.done || undefined}>
              {item.done ? <IconCircleCheck size={16} /> : <IconCircleDashed size={16} />}
              {item.label}
            </li>
          ))}
        </ul>
        <Button loading={mutation.isPending} disabled={!ready} onClick={() => mutation.mutate()}>
          Create kit
        </Button>
        <Button
          className="kit-rail-cancel"
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => router.push(`/requisitions/${requisitionId}/kits`)}
        >
          Cancel
        </Button>
      </aside>

      <PlateMarkdownEditor
        variant="document"
        value={content}
        onChange={setContent}
        templates={kitTemplates}
        placeholder="Type # for a template, or start writing…"
      />
    </article>
  );
}
