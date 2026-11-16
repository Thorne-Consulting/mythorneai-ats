'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Pencil } from 'lucide-react';
import { api } from '@/api';
import { Badge, Button, Card, CardBody, CardHeader, SkeletonRows, toast } from '@/components/ui';
import {
  draftProblem,
  toDraft,
  toInput,
  typeLabel,
  type Question,
  type QuestionDraft,
} from '@/features/careers/questions';
import { QuestionBuilder } from './QuestionBuilder';

/** The job's application questions on its Posting tab: read them, or edit them in place. */
export function JobQuestions({ id, canManage }: { id: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ['requisition-questions', id],
    queryFn: () => api.get<Question[]>(`/api/requisitions/${id}/questions`),
  });
  const [draft, setDraft] = useState<QuestionDraft[] | null>(null);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: (list: QuestionDraft[]) =>
      api.put<Question[]>(`/api/requisitions/${id}/questions`, { questions: list.map(toInput) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['requisition-questions', id], saved);
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      setDraft(null);
      setTried(false);
      toast.success('Questions saved', 'New applicants answer them on the apply page.');
    },
    onError: (e: Error) => toast.error('Could not save the questions', e.message),
  });
  const list = questions.data ?? [];
  const editing = draft !== null;
  const submit = () => {
    setTried(true);
    if (draft && draft.every((q) => !draftProblem(q))) save.mutate(draft);
  };

  return (
    <Card>
      <CardHeader
        title="Application questions"
        description={
          editing
            ? 'Drag to reorder. A flagged answer marks the application for review; nobody is rejected automatically.'
            : 'Asked on the apply page, after contact details and the resume.'
        }
        action={
          canManage &&
          !editing && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pencil />}
              disabled={!questions.data}
              onClick={() => setDraft(list.map(toDraft))}
            >
              Edit questions
            </Button>
          )
        }
      />
      <CardBody>
        {!questions.data ? (
          <SkeletonRows rows={2} className="px-0" />
        ) : editing ? (
          <div className="flex flex-col gap-4">
            <QuestionBuilder value={draft} onChange={setDraft} showErrors={tried} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button loading={save.isPending} onClick={submit}>
                Save questions
              </Button>
            </div>
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            No questions. Applicants send their contact details and resume only.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle">
            {list.map((q, i) => (
              <li
                key={q.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-5 text-right text-sm text-fg-subtle tnum">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-fg">
                    {q.label}
                    {q.required && <span className="text-fg-subtle"> (required)</span>}
                  </p>
                  {q.options.length > 0 && (
                    <p className="mt-0.5 text-sm text-fg-muted">{q.options.join(' · ')}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="gray">{typeLabel(q.type)}</Badge>
                  {q.knockoutAnswers.length > 0 && (
                    <Badge tone="red" icon={<Flag />}>
                      Flags “{q.knockoutAnswers.join('”, “')}”
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
