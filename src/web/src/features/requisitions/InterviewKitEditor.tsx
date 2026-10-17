'use client';

import { useState } from 'react';
import { Button, NumberInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { DocumentEditor } from '@/components/plate/document-editor';
import type { InterviewKit } from '@/types';
import { kitBlocks, kitTemplates, kitToMarkdown, parseKit } from './interview-kit-doc';

/**
 * An interview kit written as one document. Type # for templates. Pass `existing` to edit a saved
 * kit: its competencies keep their scorecard history by name.
 */
export function InterviewKitEditor({
  requisitionId,
  existing,
}: {
  requisitionId: string;
  existing?: InterviewKit;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [duration, setDuration] = useState<number | string>(existing?.durationMinutes ?? 60);
  const [content, setContent] = useState(existing ? kitToMarkdown(existing) : '');
  const kit = parseKit(content);
  const verb = existing ? 'saved' : 'created';

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: kit.name,
        durationMinutes: Number(duration),
        instructions: kit.instructions,
        candidateMessage: kit.candidateMessage,
        interviewerMessage: kit.interviewerMessage,
      };
      if (!existing)
        return api.post(`/api/requisitions/${requisitionId}/interview-kits`, {
          ...body,
          criteria: kit.criteria,
        });
      // A competency with the same name as a saved one is the same competency.
      const idByName = new Map(existing.criteria.map((item) => [item.name.toLowerCase(), item.id]));
      return api.put(`/api/requisitions/${requisitionId}/interview-kits/${existing.id}`, {
        ...body,
        criteria: kit.criteria.map((item) => ({
          ...item,
          id: idByName.get(item.name.toLowerCase()),
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      notifications.show({ color: 'teal', message: `Interview kit ${verb}` });
      router.push(`/requisitions/${requisitionId}/kits`);
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: `Could not save the kit`,
        message: error.message,
      }),
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
        <p className="kit-rail-title">{existing ? 'Before you save' : 'Before you create'}</p>
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
          {existing ? 'Save changes' : 'Create kit'}
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

      <DocumentEditor
        value={content}
        onChange={setContent}
        templates={kitTemplates}
        blocks={kitBlocks}
      />
    </article>
  );
}
