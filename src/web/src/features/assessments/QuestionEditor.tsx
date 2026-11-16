'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleDot,
  Code2,
  Copy,
  FileUp,
  ListChecks,
  Plus,
  Text,
  TextCursorInput,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  MultiSelect,
  NumberInput,
  Select,
  Switch,
  Textarea,
  toast,
} from '@/components/ui';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { cn } from '@/lib/cn';
import { CodeEditor } from './CodeEditor';
import {
  codeLanguages,
  copyQuestion,
  isAutoScored,
  newQuestion,
  newSection,
  plural,
  promptLine,
  questionProblems,
  questionTypeLabels,
  uploadTypes,
  type Question,
  type QuestionType,
  type Section,
} from './scoring';

const typeIcons: Record<QuestionType, LucideIcon> = {
  single: CircleDot,
  multi: ListChecks,
  short: TextCursorInput,
  long: Text,
  code: Code2,
  file: FileUp,
};

const typeOptions = (Object.keys(questionTypeLabels) as QuestionType[]).map((t) => ({
  value: t,
  label: questionTypeLabels[t],
}));

/**
 * Sections of questions. Each question is one line until you open it, so a long test stays
 * scannable. Removing undoes from the toast; removing a section with questions asks first.
 */
export function QuestionsEditor({
  sections,
  onChange,
}: {
  sections: Section[];
  onChange: (sections: Section[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(sections[0]?.questions[0]?.id ?? null);
  const [removing, setRemoving] = useState<number | null>(null);

  const setSection = (si: number, patch: Partial<Section>) =>
    onChange(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const setQuestion = (si: number, qi: number, q: Question) =>
    setSection(si, { questions: sections[si].questions.map((x, i) => (i === qi ? q : x)) });

  const withUndo = (next: Section[], message: string) => {
    const before = sections;
    onChange(next);
    toast.success(message, undefined, {
      action: { label: 'Undo', onClick: () => onChange(before) },
      duration: 8000,
    });
  };

  /** Up or down; at a section edge the question moves into the next section. */
  const move = (si: number, qi: number, dir: -1 | 1) => {
    const next = sections.map((s) => ({ ...s, questions: [...s.questions] }));
    const list = next[si].questions;
    const target = qi + dir;
    if (target >= 0 && target < list.length) [list[qi], list[target]] = [list[target], list[qi]];
    else if (next[si + dir]) {
      const [q] = list.splice(qi, 1);
      if (dir < 0) next[si - 1].questions.push(q);
      else next[si + 1].questions.unshift(q);
    }
    onChange(next);
  };

  const removeSection = (si: number) =>
    withUndo(
      sections.filter((_, i) => i !== si),
      `${sections[si].title || 'Section'} removed`,
    );

  let number = 0;
  return (
    <div className="flex flex-col gap-5">
      {sections.map((s, si) => (
        <section
          key={s.id}
          aria-label={s.title || `Section ${si + 1}`}
          className="overflow-hidden rounded-xl border border-border-subtle"
        >
          <div className="flex items-center gap-2 border-b border-border-subtle bg-muted px-3 py-2.5 sm:px-4">
            <Input
              aria-label={`Section ${si + 1} title`}
              value={s.title}
              placeholder={`Section ${si + 1}`}
              onChange={(e) => setSection(si, { title: e.currentTarget.value })}
              className="min-w-0 flex-1"
              inputClassName="font-semibold"
            />
            <span className="hidden shrink-0 text-xs text-fg-subtle tnum sm:inline">
              {plural(s.questions.length, 'question')}
            </span>
            <IconButton
              label={`Remove section ${s.title || si + 1}`}
              variant="quiet"
              size="sm"
              disabled={sections.length === 1}
              onClick={() => (s.questions.length ? setRemoving(si) : removeSection(si))}
            >
              <Trash2 />
            </IconButton>
          </div>
          <ol className="divide-y divide-border-subtle">
            {s.questions.length === 0 && (
              <li className="px-4 py-4 text-sm text-fg-subtle">
                No questions in this section yet.
              </li>
            )}
            {s.questions.map((q, qi) => {
              const n = ++number;
              const first = si === 0 && qi === 0;
              const last = si === sections.length - 1 && qi === s.questions.length - 1;
              return (
                <li key={q.id}>
                  <QuestionRow
                    n={n}
                    q={q}
                    open={open === q.id}
                    onToggle={() => setOpen(open === q.id ? null : q.id)}
                    onChange={(next) => setQuestion(si, qi, next)}
                    canUp={!first}
                    canDown={!last}
                    onMove={(dir) => move(si, qi, dir)}
                    onDuplicate={() => {
                      const copy = copyQuestion(q);
                      setSection(si, {
                        questions: [
                          ...s.questions.slice(0, qi + 1),
                          copy,
                          ...s.questions.slice(qi + 1),
                        ],
                      });
                      setOpen(copy.id);
                    }}
                    onRemove={() =>
                      withUndo(
                        sections.map((x, i) =>
                          i === si
                            ? { ...x, questions: x.questions.filter((_, j) => j !== qi) }
                            : x,
                        ),
                        `Question ${n} removed`,
                      )
                    }
                  />
                </li>
              );
            })}
          </ol>
          <div className="border-t border-border-subtle px-3 py-2.5 sm:px-4">
            <Menu>
              <MenuTrigger asChild>
                <Button variant="soft" size="sm" leftIcon={<Plus />}>
                  Add question
                </Button>
              </MenuTrigger>
              <MenuContent align="start">
                {typeOptions.map((t) => {
                  const Icon = typeIcons[t.value];
                  return (
                    <MenuItem
                      key={t.value}
                      icon={<Icon />}
                      onSelect={() => {
                        const q = newQuestion(t.value);
                        setSection(si, { questions: [...s.questions, q] });
                        setOpen(q.id);
                      }}
                    >
                      {t.label}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          </div>
        </section>
      ))}
      <Button
        variant="secondary"
        leftIcon={<Plus />}
        className="self-start"
        onClick={() => onChange([...sections, newSection(sections.length + 1)])}
      >
        Add section
      </Button>
      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this section?"
        message={
          removing !== null &&
          `${sections[removing]?.title || 'This section'} and its ${plural(sections[removing]?.questions.length ?? 0, 'question')} are removed. You can undo it right after.`
        }
        confirmLabel="Remove section"
        onConfirm={() => {
          if (removing !== null) removeSection(removing);
        }}
      />
    </div>
  );
}

function QuestionRow({
  n,
  q,
  open,
  onToggle,
  onChange,
  canUp,
  canDown,
  onMove,
  onDuplicate,
  onRemove,
}: {
  n: number;
  q: Question;
  open: boolean;
  onToggle: () => void;
  onChange: (q: Question) => void;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const problems = questionProblems(q);
  const Icon = typeIcons[q.type];
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const changeType = (type: QuestionType) => {
    const fresh = newQuestion(type, q.id);
    // Choice to choice keeps the answers (one answer keeps at most one marked correct).
    const keep = isAutoScored(q) && isAutoScored(fresh);
    let seen = false;
    set({
      ...fresh,
      prompt: q.prompt,
      rubric: q.rubric,
      options: keep
        ? q.options.map((o) => {
            const correct = o.correct && (type === 'multi' || !seen);
            if (o.correct) seen = true;
            return { ...o, correct };
          })
        : fresh.options,
    });
  };
  const panelId = `question-${q.id}`;

  return (
    <div className={cn(open && 'bg-muted/40')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none sm:px-4"
      >
        <span className="w-6 shrink-0 text-sm font-semibold text-fg-subtle tnum">{n}.</span>
        <Icon className="size-4 shrink-0 text-fg-subtle" aria-label={questionTypeLabels[q.type]} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-base',
            q.prompt.trim() ? 'text-fg' : 'text-fg-subtle',
          )}
        >
          {promptLine(q.prompt) || 'No question text yet'}
        </span>
        {problems.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-tone-amber-fg">
            <span className="size-2 rounded-full bg-tone-amber-dot" aria-hidden />
            <span className="hidden sm:inline">Needs work</span>
            <span className="sr-only sm:hidden">Needs work</span>
          </span>
        )}
        <span className="shrink-0 text-xs text-fg-subtle tnum">{plural(q.points, 'point')}</span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 px-3 pt-1 pb-5 sm:px-4 sm:pl-[52px]">
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Type"
              data={typeOptions}
              value={q.type}
              onChange={(v) => v && changeType(v as QuestionType)}
              className="min-w-0 basis-full sm:max-w-72 sm:flex-1 sm:basis-0"
            />
            <NumberInput
              label="Points"
              min={1}
              max={1000}
              value={q.points || ''}
              onValueChange={(v) => set({ points: v === '' ? 0 : Math.round(v) })}
              className="w-24"
            />
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={`Move question ${n} up`}
                variant="quiet"
                size="sm"
                disabled={!canUp}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label={`Move question ${n} down`}
                variant="quiet"
                size="sm"
                disabled={!canDown}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </IconButton>
              <IconButton
                label={`Duplicate question ${n}`}
                variant="quiet"
                size="sm"
                onClick={onDuplicate}
              >
                <Copy />
              </IconButton>
              <IconButton
                label={`Remove question ${n}`}
                variant="quiet"
                size="sm"
                onClick={onRemove}
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">Question</span>
            <PlateMarkdownEditor
              value={q.prompt}
              onChange={(prompt) => set({ prompt })}
              placeholder="Ask your question. Paste code between ``` lines to show it as code."
            />
          </div>

          {isAutoScored(q) && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">
                Answers{' '}
                <span className="font-normal text-fg-subtle">
                  · mark the correct {q.type === 'single' ? 'one' : 'ones'}
                </span>
              </legend>
              <ul className="flex flex-col gap-2">
                {q.options.map((o, oi) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <input
                      type={q.type === 'single' ? 'radio' : 'checkbox'}
                      name={`correct-${q.id}`}
                      aria-label={`Answer ${oi + 1} is correct`}
                      checked={o.correct}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        set({
                          options: q.options.map((x) =>
                            x.id === o.id
                              ? { ...x, correct: q.type === 'single' ? true : on }
                              : q.type === 'single'
                                ? { ...x, correct: false }
                                : x,
                          ),
                        });
                      }}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <Input
                      aria-label={`Answer ${oi + 1}`}
                      placeholder={`Answer ${oi + 1}`}
                      value={o.text}
                      onChange={(e) => {
                        const text = e.currentTarget.value;
                        set({
                          options: q.options.map((x) => (x.id === o.id ? { ...x, text } : x)),
                        });
                      }}
                      className="min-w-0 flex-1"
                    />
                    <IconButton
                      label={`Remove answer ${oi + 1}`}
                      variant="quiet"
                      size="sm"
                      disabled={q.options.length <= 2}
                      onClick={() => set({ options: q.options.filter((x) => x.id !== o.id) })}
                    >
                      <X />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <Button
                variant="link"
                size="sm"
                leftIcon={<Plus />}
                className="mt-1"
                disabled={q.options.length >= 20}
                onClick={() =>
                  set({ options: [...q.options, { ...newQuestion('single').options[0] }] })
                }
              >
                Add answer
              </Button>
              {q.type === 'multi' && (
                <Switch
                  className="mt-3"
                  label="Give partial credit"
                  description="Each correct pick earns its share of the points. Each wrong pick takes one share away."
                  checked={q.partialCredit}
                  onCheckedChange={(partialCredit) => set({ partialCredit })}
                />
              )}
            </fieldset>
          )}

          {q.type === 'code' && (
            <div className="flex flex-col gap-3">
              <Select
                label="Language"
                data={codeLanguages}
                value={q.language || null}
                onChange={(v) => set({ language: v ?? '' })}
                className="sm:max-w-56"
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">Starter code</span>
                <span className="text-xs text-fg-subtle">
                  What applicants see when they open the question. Leave it empty to start blank.
                </span>
                <CodeEditor
                  aria-label={`Starter code for question ${n}`}
                  language={q.language}
                  value={q.starterCode}
                  onChange={(starterCode) => set({ starterCode })}
                  minHeight="120px"
                />
              </div>
            </div>
          )}

          {q.type === 'file' && (
            <MultiSelect
              label="File types allowed"
              description="Up to 25 MB. Leave it empty to allow every type listed."
              data={uploadTypes.map((t) => ({ value: t, label: t.slice(1).toUpperCase() }))}
              value={q.accept
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)}
              onChange={(v) => set({ accept: v.join(',') })}
              className="sm:max-w-md"
            />
          )}

          {!isAutoScored(q) && (
            <Textarea
              label="How to score"
              description="What a full-marks answer includes. Reviewers see this next to the answer."
              minRows={2}
              value={q.rubric}
              onChange={(e) => set({ rubric: e.currentTarget.value })}
            />
          )}

          {problems.length > 0 && (
            <p className="text-xs text-tone-amber-fg" role="status">
              To publish: {problems.join(', ').toLowerCase()}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
