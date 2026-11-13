'use client';

import { useState } from 'react';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { Button, Card, NumberInput, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
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
  const [duration, setDuration] = useState<number | ''>(existing?.durationMinutes ?? 60);
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
      toast.success(`Interview kit ${verb}`);
      router.push(`/jobs/${requisitionId}/kits`);
    },
    onError: (error: Error) => toast.error('Could not save the kit', error.message),
  });

  const durationOk = Number(duration) >= 15 && Number(duration) <= 480;
  const checks = [
    { label: 'A title', done: Boolean(kit.name) },
    { label: 'A duration', done: durationOk },
    { label: 'At least one scorecard row', done: kit.criteria.length > 0 },
  ];
  const ready = checks.every((item) => item.done);

  return (
    <article className="grid items-start gap-5 xl:grid-cols-[1fr_260px]">
      {/* The checklist comes first on narrow screens, beside the page on wide ones. */}
      <Card className="flex flex-col gap-4 p-4 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1">
        <p className="text-base font-semibold text-fg">
          {existing ? 'Before you save' : 'Before you create'}
        </p>
        <NumberInput
          label="Duration"
          min={15}
          max={480}
          step={15}
          rightSection="min"
          value={duration}
          onValueChange={setDuration}
          error={durationOk ? undefined : 'Choose 15 to 480 minutes'}
        />
        <ul className="flex flex-col gap-2">
          {checks.map((item) => (
            <li
              key={item.label}
              className={cn(
                'flex items-center gap-2 text-sm',
                item.done ? 'text-fg' : 'text-fg-subtle',
              )}
            >
              {item.done ? (
                <CircleCheck className="size-4 text-tone-green-dot" aria-hidden />
              ) : (
                <CircleDashed className="size-4" aria-hidden />
              )}
              {item.label}
              <span className="sr-only">{item.done ? '(done)' : '(to do)'}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <Button
            loading={mutation.isPending}
            disabled={!ready}
            onClick={() => mutation.mutate()}
            fullWidth
          >
            {existing ? 'Save changes' : 'Create kit'}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => router.push(`/jobs/${requisitionId}/kits`)}
          >
            Cancel
          </Button>
        </div>
      </Card>

      <Card className="min-w-0 px-6 py-5 xl:col-start-1 xl:row-start-1">
        <DocumentEditor
          value={content}
          onChange={setContent}
          templates={kitTemplates}
          blocks={kitBlocks}
        />
      </Card>
    </article>
  );
}
