'use client';

import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react';
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  NumberInput,
  Select,
  Textarea,
} from '@/components/ui';
import { codeLanguages, newQuestion, type Section } from '../sample-assessments';
import {
  isAutoScored,
  questionProblems,
  questionTypeLabels,
  type Question,
  type QuestionType,
} from './scoring';

const typeOptions = (Object.keys(questionTypeLabels) as QuestionType[]).map((t) => ({
  value: t,
  label: questionTypeLabels[t],
}));

const newSection = (n: number): Section => ({
  id: crypto.randomUUID(),
  title: `Section ${n}`,
  questions: [],
});

/** Sections of questions: add, edit, reorder (also across sections) and remove. */
export function QuestionsEditor({
  sections,
  onChange,
}: {
  sections: Section[];
  onChange: (sections: Section[]) => void;
}) {
  const setSection = (si: number, patch: Partial<Section>) =>
    onChange(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const setQuestion = (si: number, qi: number, q: Question) =>
    setSection(si, { questions: sections[si].questions.map((x, i) => (i === qi ? q : x)) });

  /** Up/down; at a section edge the question moves into the neighbouring section. */
  const move = (si: number, qi: number, dir: -1 | 1) => {
    const next = sections.map((s) => ({ ...s, questions: [...s.questions] }));
    const list = next[si].questions;
    const target = qi + dir;
    if (target >= 0 && target < list.length) {
      [list[qi], list[target]] = [list[target], list[qi]];
    } else if (next[si + dir]) {
      const [q] = list.splice(qi, 1);
      if (dir < 0) next[si - 1].questions.push(q);
      else next[si + 1].questions.unshift(q);
    }
    onChange(next);
  };

  let number = 0;
  return (
    <div className="flex flex-col gap-5">
      {sections.map((s, si) => (
        <section
          key={s.id}
          aria-label={s.title || `Section ${si + 1}`}
          className="rounded-xl border border-border-subtle"
        >
          <div className="flex items-end gap-2 border-b border-border-subtle bg-muted px-4 py-3">
            <Input
              label={`Section ${si + 1} title`}
              value={s.title}
              onChange={(e) => setSection(si, { title: e.currentTarget.value })}
              className="flex-1"
            />
            <IconButton
              label={`Remove section ${s.title || si + 1}`}
              variant="quiet"
              onClick={() => onChange(sections.filter((_, i) => i !== si))}
            >
              <Trash2 />
            </IconButton>
          </div>
          <div className="flex flex-col gap-4 p-4">
            {s.questions.length === 0 && (
              <p className="text-sm text-fg-subtle">No questions in this section yet.</p>
            )}
            {s.questions.map((q, qi) => {
              const n = ++number;
              const first = si === 0 && qi === 0;
              const last = si === sections.length - 1 && qi === s.questions.length - 1;
              return (
                <QuestionCard
                  key={q.id}
                  n={n}
                  q={q}
                  onChange={(next) => setQuestion(si, qi, next)}
                  onMove={first && last ? undefined : (dir) => move(si, qi, dir)}
                  canUp={!first}
                  canDown={!last}
                  onDuplicate={() =>
                    setSection(si, {
                      questions: [
                        ...s.questions.slice(0, qi + 1),
                        {
                          ...q,
                          id: crypto.randomUUID(),
                          options: q.options.map((o) => ({ ...o, id: crypto.randomUUID() })),
                        },
                        ...s.questions.slice(qi + 1),
                      ],
                    })
                  }
                  onRemove={() =>
                    setSection(si, { questions: s.questions.filter((_, i) => i !== qi) })
                  }
                />
              );
            })}
            <AddQuestion
              onAdd={(type) => setSection(si, { questions: [...s.questions, newQuestion(type)] })}
            />
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
    </div>
  );
}

function AddQuestion({ onAdd }: { onAdd: (type: QuestionType) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="soft" size="sm" leftIcon={<Plus />} className="self-start">
          Add question
        </Button>
      </MenuTrigger>
      <MenuContent>
        {typeOptions.map((t) => (
          <MenuItem key={t.value} onSelect={() => onAdd(t.value)}>
            {t.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function QuestionCard({
  n,
  q,
  onChange,
  onMove,
  canUp,
  canDown,
  onDuplicate,
  onRemove,
}: {
  n: number;
  q: Question;
  onChange: (q: Question) => void;
  onMove?: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const problems = questionProblems(q);
  const changeType = (type: QuestionType) => {
    const fresh = newQuestion(type, q.id);
    // Keep what carries over; choice ↔ choice keeps options (single keeps at most one correct).
    const keepOptions = isAutoScored(q) && isAutoScored(fresh);
    let seen = false;
    set({
      ...fresh,
      prompt: q.prompt,
      rubric: q.rubric,
      options: keepOptions
        ? q.options.map((o) => {
            const correct = o.correct && (type === 'multi' || !seen);
            if (o.correct) seen = true;
            return { ...o, correct };
          })
        : fresh.options,
    });
  };
  return (
    <div className="rounded-lg border border-border-subtle p-4">
      <div className="flex flex-wrap items-end gap-2">
        <span className="mb-2.5 text-sm font-semibold text-fg-subtle tnum">Q{n}</span>
        <Select
          label="Type"
          data={typeOptions}
          value={q.type}
          onChange={(v) => v && changeType(v as QuestionType)}
          className="min-w-0 flex-1 sm:max-w-64"
        />
        <NumberInput
          label="Points"
          min={1}
          value={q.points || ''}
          onValueChange={(v) => set({ points: v === '' ? 0 : v })}
          className="w-24"
        />
        <div className="ml-auto flex items-center gap-1">
          {onMove && (
            <>
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
            </>
          )}
          <IconButton
            label={`Duplicate question ${n}`}
            variant="quiet"
            size="sm"
            onClick={onDuplicate}
          >
            <Copy />
          </IconButton>
          <IconButton label={`Remove question ${n}`} variant="quiet" size="sm" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <Textarea
        label="Question"
        minRows={2}
        value={q.prompt}
        onChange={(e) => set({ prompt: e.currentTarget.value })}
        className="mt-3"
      />

      {isAutoScored(q) && (
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-sm font-medium text-fg">
            Options{' '}
            <span className="font-normal text-fg-subtle">
              · tick the correct {q.type === 'single' ? 'answer' : 'answers'}
            </span>
          </legend>
          <ul className="flex flex-col gap-2">
            {q.options.map((o, oi) => (
              <li key={o.id} className="flex items-center gap-2">
                <Checkbox
                  aria-label={`Option ${oi + 1} is correct`}
                  checked={o.correct}
                  onCheckedChange={(on) =>
                    set({
                      options: q.options.map((x) =>
                        x.id === o.id
                          ? { ...x, correct: on }
                          : q.type === 'single' && on
                            ? { ...x, correct: false }
                            : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Option ${oi + 1}`}
                  placeholder={`Option ${oi + 1}`}
                  value={o.text}
                  onChange={(e) => {
                    const text = e.currentTarget.value;
                    set({ options: q.options.map((x) => (x.id === o.id ? { ...x, text } : x)) });
                  }}
                  className="flex-1"
                />
                <IconButton
                  label={`Remove option ${oi + 1}`}
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
            onClick={() =>
              set({
                options: [...q.options, { id: crypto.randomUUID(), text: '', correct: false }],
              })
            }
          >
            Add option
          </Button>
        </fieldset>
      )}

      {q.type === 'code' && (
        <div className="mt-3 grid gap-3">
          <Select
            label="Language"
            data={codeLanguages}
            value={q.language || null}
            onChange={(v) => set({ language: v ?? '' })}
            className="sm:max-w-56"
          />
          <Textarea
            label="Starter code"
            description="What the candidate sees in the editor when they start."
            minRows={4}
            spellCheck={false}
            textareaClassName="font-mono text-sm"
            value={q.starterCode}
            onChange={(e) => set({ starterCode: e.currentTarget.value })}
          />
        </div>
      )}

      {q.type === 'file' && (
        <Input
          label="Accepted file types"
          description="Comma separated, e.g. .pdf,.png"
          value={q.accept}
          onChange={(e) => set({ accept: e.currentTarget.value })}
          className="mt-3 sm:max-w-80"
        />
      )}

      {!isAutoScored(q) && (
        <Textarea
          label="Rubric"
          description="What a full-marks answer includes. Reviewers score against this."
          minRows={2}
          value={q.rubric}
          onChange={(e) => set({ rubric: e.currentTarget.value })}
          className="mt-3"
        />
      )}

      {problems.length > 0 && (
        <p className="mt-3 text-xs text-tone-amber-fg" role="status">
          To publish: {problems.join(' · ').toLowerCase()}
        </p>
      )}
    </div>
  );
}
