'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Plus } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Modal,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import {
  QUESTION_TYPES,
  blankQuestion,
  draftProblem,
  toDraft,
  toInput,
  typeLabel,
  type Question,
  type QuestionDraft,
} from '@/features/careers/questions';
import { QuestionRow, useQuestionBank } from '@/features/requisitions/QuestionBuilder';

/** Questions saved once and added to any job or template ("Work authorization", "Notice period"). */
export function QuestionBank() {
  const queryClient = useQueryClient();
  const bank = useQuestionBank();
  const [editing, setEditing] = useState<{ id?: string; draft: QuestionDraft } | null>(null);
  const [removing, setRemoving] = useState<Question | null>(null);
  const [tried, setTried] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['question-bank'] });
  const save = useMutation({
    mutationFn: (input: { id?: string; draft: QuestionDraft }) =>
      input.id
        ? api.put(`/api/question-bank/${input.id}`, toInput(input.draft))
        : api.post('/api/question-bank', toInput(input.draft)),
    onSuccess: () => {
      refresh();
      setEditing(null);
      setTried(false);
      toast.success('Question saved');
    },
    onError: (e: Error) => toast.error('Could not save the question', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/question-bank/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Question removed', 'Jobs that use it keep their copy.');
    },
    onError: (e: Error) => toast.error('Could not remove the question', e.message),
  });
  const list = bank.data ?? [];
  const problem = editing ? draftProblem(editing.draft) : null;

  return (
    <Card>
      <CardHeader
        title="Question bank"
        description="Questions you ask often. Add them to a job or a template in one step."
        action={
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" leftIcon={<Plus />}>
                Add question
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {QUESTION_TYPES.map((t) => (
                <MenuItem
                  key={t.value}
                  onSelect={() => setEditing({ draft: blankQuestion(t.value) })}
                >
                  {t.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        }
      />
      {!bank.data ? (
        <SkeletonRows rows={2} />
      ) : list.length === 0 ? (
        <p className="border-t border-border-subtle px-5 py-5 text-sm text-fg-subtle">
          Nothing saved yet. Use “Save to question bank” on a job’s question, or add one here.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {list.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-base text-fg">{q.label}</p>
                {q.options.length > 0 && (
                  <p className="text-sm text-fg-muted">{q.options.join(' · ')}</p>
                )}
              </div>
              <Badge tone="gray">{typeLabel(q.type)}</Badge>
              {q.knockoutAnswers.length > 0 && (
                <Badge tone="red" icon={<Flag />}>
                  Flags “{q.knockoutAnswers.join('”, “')}”
                </Badge>
              )}
              <RowActions label={`Actions for ${q.label}`}>
                <MenuItem onSelect={() => setEditing({ id: q.id, draft: toDraft(q) })}>
                  Edit
                </MenuItem>
                <MenuItem onSelect={() => setRemoving(q)}>Remove</MenuItem>
              </RowActions>
            </li>
          ))}
        </ul>
      )}

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit question' : 'New question'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                setTried(true);
                if (editing && !problem) save.mutate(editing);
              }}
            >
              Save question
            </Button>
          </>
        }
      >
        {editing && (
          <QuestionRow
            question={editing.draft}
            index={0}
            error={tried ? problem : null}
            onChange={(patch) => setEditing({ ...editing, draft: { ...editing.draft, ...patch } })}
          />
        )}
      </Modal>
      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this question from the bank?"
        message="Jobs and templates that use it keep their own copy."
        confirmLabel="Remove question"
        onConfirm={() => (removing ? remove.mutate(removing.id) : undefined)}
      />
    </Card>
  );
}
