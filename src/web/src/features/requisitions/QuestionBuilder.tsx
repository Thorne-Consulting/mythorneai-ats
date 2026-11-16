'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/api';
import { cn } from '@/lib/cn';
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SearchSelect,
  Select,
  SortableList,
  Switch,
  toast,
} from '@/components/ui';
import {
  QUESTION_TYPES,
  blankQuestion,
  draftProblem,
  hasOptions,
  toDraft,
  toInput,
  typeLabel,
  type Question,
  type QuestionDraft,
  type QuestionType,
} from '@/features/careers/questions';

export function useQuestionBank() {
  return useQuery({
    queryKey: ['question-bank'],
    queryFn: () => api.get<Question[]>('/api/question-bank'),
    staleTime: 60_000,
  });
}

/**
 * The application questions of a job or a posting template: add, reorder by dragging, pick a type,
 * mark required, give choices, and flag answers for review. Questions can come from, and be saved
 * to, the organization's question bank.
 */
export function QuestionBuilder({
  value,
  onChange,
  showErrors = false,
}: {
  value: QuestionDraft[];
  onChange: (questions: QuestionDraft[]) => void;
  /** Show each question's problem (after a save attempt). */
  showErrors?: boolean;
}) {
  const bank = useQuestionBank();
  const update = (key: string, patch: Partial<QuestionDraft>) =>
    onChange(value.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const unused = (bank.data ?? []).filter(
    (b) => !value.some((q) => q.bankQuestionId === b.id || q.label.trim() === b.label),
  );
  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-fg-subtle">
          No questions yet. Applicants send their details and resume only.
        </p>
      ) : (
        <SortableList
          id="question-builder"
          items={value}
          getKey={(q) => q.key}
          getLabel={(q) => q.label.trim() || 'the question'}
          onReorder={onChange}
          itemClassName="p-3"
          renderItem={(q, handle, index) => (
            <QuestionRow
              question={q}
              handle={handle}
              index={index}
              error={showErrors ? draftProblem(q) : null}
              onChange={(patch) => update(q.key, patch)}
              onRemove={() => onChange(value.filter((x) => x.key !== q.key))}
            />
          )}
        />
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="sm" leftIcon={<Plus />} disabled={value.length >= 50}>
              Add question
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            {QUESTION_TYPES.map((t) => (
              <MenuItem key={t.value} onSelect={() => onChange([...value, blankQuestion(t.value)])}>
                {t.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
        {unused.length > 0 && (
          <SearchSelect
            label="Add from question bank"
            className="w-full max-w-xs"
            placeholder="Search saved questions"
            data={unused.map((b) => ({ value: b.id, label: b.label, group: typeLabel(b.type) }))}
            value={null}
            onChange={(id) => {
              const found = bank.data?.find((b) => b.id === id);
              if (found)
                onChange([
                  ...value,
                  { ...toDraft({ ...found, id: undefined }), bankQuestionId: found.id },
                ]);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** One question being edited. Without `onRemove` (the question bank's dialog) it has no remove or bank buttons. */
export function QuestionRow({
  question: q,
  handle,
  index,
  error,
  onChange,
  onRemove,
}: {
  question: QuestionDraft;
  handle?: React.ReactNode;
  index: number;
  error: string | null;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onRemove?: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(!!q.helpText);
  const queryClient = useQueryClient();
  const saveToBank = useMutation({
    mutationFn: () => api.post<Question>('/api/question-bank', toInput(q)),
    onSuccess: (saved) => {
      onChange({ bankQuestionId: saved.id });
      queryClient.invalidateQueries({ queryKey: ['question-bank'] });
      toast.success('Saved to the question bank', 'Add it to any job or template.');
    },
    onError: (e: Error) => toast.error('Could not save the question', e.message),
  });
  const n = index + 1;
  const choices = hasOptions(q.type);
  const toggleKnockout = (option: string, on: boolean) =>
    onChange({
      knockoutAnswers: on
        ? [...q.knockoutAnswers, option]
        : q.knockoutAnswers.filter((k) => k !== option),
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        {handle}
        <Input
          aria-label={`Question ${n}`}
          placeholder="Write the question"
          className="min-w-[200px] flex-1"
          value={q.label}
          error={error ?? undefined}
          onChange={(e) => onChange({ label: e.currentTarget.value })}
        />
        <Select
          aria-label={`Type of question ${n}`}
          className="w-44 shrink-0"
          value={q.type}
          data={QUESTION_TYPES}
          onChange={(type) => {
            if (!type) return;
            const t = type as QuestionType;
            onChange({
              type: t,
              options:
                t === 'YesNo'
                  ? ['Yes', 'No']
                  : hasOptions(t)
                    ? q.type === 'YesNo' || !hasOptions(q.type)
                      ? ['', '']
                      : q.options
                    : [],
              knockoutAnswers: hasOptions(t) && t === q.type ? q.knockoutAnswers : [],
            });
          }}
        />
        {onRemove && (
          <IconButton variant="quiet" label={`Remove question ${n}`} onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>

      {choices && (
        <div className={cn('flex flex-col gap-1.5', handle && 'sm:pl-10')}>
          <p className="text-xs font-medium text-fg-subtle">Answers</p>
          <ul className="flex flex-col gap-1.5">
            {q.options.map((option, i) => {
              const flagged = !!option.trim() && q.knockoutAnswers.includes(option);
              return (
                <li key={i} className="flex items-center gap-2">
                  {q.type === 'YesNo' ? (
                    <span className="min-w-0 flex-1 text-sm text-fg sm:w-56 sm:flex-none">
                      {option}
                    </span>
                  ) : (
                    <Input
                      aria-label={`Answer ${i + 1} of question ${n}`}
                      placeholder={`Answer ${i + 1}`}
                      size="sm"
                      className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                      value={option}
                      onChange={(e) => {
                        const next = [...q.options];
                        next[i] = e.currentTarget.value;
                        onChange({
                          options: next,
                          knockoutAnswers: q.knockoutAnswers.filter((k) => k !== option),
                        });
                      }}
                    />
                  )}
                  <Checkbox
                    className="shrink-0"
                    label="Flag for review"
                    checked={flagged}
                    disabled={!option.trim()}
                    onCheckedChange={(on) => toggleKnockout(option, on === true)}
                  />
                  {q.type !== 'YesNo' && q.options.length > 2 && (
                    <IconButton
                      size="sm"
                      variant="quiet"
                      label={`Remove answer ${i + 1}`}
                      onClick={() =>
                        onChange({
                          options: q.options.filter((_, j) => j !== i),
                          knockoutAnswers: q.knockoutAnswers.filter((k) => k !== option),
                        })
                      }
                    >
                      <X />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
          {q.type !== 'YesNo' && q.options.length < 30 && (
            <div>
              <Button
                size="xs"
                variant="quiet"
                leftIcon={<Plus />}
                onClick={() => onChange({ options: [...q.options, ''] })}
              >
                Add an answer
              </Button>
            </div>
          )}
        </div>
      )}

      {helpOpen && (
        <div className={cn(handle && 'sm:pl-10')}>
          <Input
            aria-label={`Help text for question ${n}`}
            placeholder="A line under the question, for example why you ask"
            size="sm"
            value={q.helpText}
            onChange={(e) => onChange({ helpText: e.currentTarget.value })}
          />
        </div>
      )}

      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', handle && 'sm:pl-10')}>
        <Switch
          label="Required"
          checked={q.required}
          onCheckedChange={(required) => onChange({ required })}
        />
        {!helpOpen && (
          <Button size="xs" variant="quiet" onClick={() => setHelpOpen(true)}>
            Add help text
          </Button>
        )}
        {!onRemove ? null : q.bankQuestionId ? (
          <span className="text-xs text-fg-subtle">From the question bank</span>
        ) : (
          <Button
            size="xs"
            variant="quiet"
            leftIcon={<BookmarkPlus />}
            disabled={!!draftProblem(q)}
            loading={saveToBank.isPending}
            onClick={() => saveToBank.mutate()}
          >
            Save to question bank
          </Button>
        )}
      </div>
    </div>
  );
}
