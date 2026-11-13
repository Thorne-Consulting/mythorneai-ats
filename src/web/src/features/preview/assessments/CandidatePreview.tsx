'use client';

import { useState } from 'react';
import { Clock, ListChecks } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileDrop,
  Input,
  RadioGroup,
  Textarea,
} from '@/components/ui';
import type { Assessment } from '../sample-assessments';

/** The assessment as a candidate sees it. Answers here are throwaway; nothing is saved. */
export function CandidatePreview({ a }: { a: Omit<Assessment, 'id' | 'status' | 'tone'> }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const set = (id: string, v: string[]) => setAnswers((x) => ({ ...x, [id]: v }));
  const count = a.sections.reduce((n, s) => n + s.questions.length, 0);
  let n = 0;
  return (
    <div className="rounded-xl border border-border-subtle bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs text-fg-subtle">Candidate view</p>
        <h3 className="mt-1 text-xl font-semibold text-fg">{a.name || 'Untitled assessment'}</h3>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden />
            {a.minutes} min{a.settings.timed && ', submits when time runs out'}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-4" aria-hidden />
            {count} questions
          </span>
        </p>
        {a.instructions && (
          <Alert tone="info" className="mt-4">
            <span className="whitespace-pre-wrap">{a.instructions}</span>
          </Alert>
        )}
        {(a.settings.webcam ||
          a.settings.fullscreen ||
          a.settings.tabSwitch ||
          a.settings.blockPaste) && (
          <p className="mt-3 text-xs text-fg-subtle">
            This assessment is proctored:{' '}
            {[
              a.settings.webcam && 'your webcam is recorded',
              a.settings.fullscreen && 'it runs in full screen',
              a.settings.tabSwitch && 'leaving the tab is logged',
              a.settings.blockPaste && 'pasting is turned off',
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
        )}

        {a.sections.map((s) => (
          <section key={s.id} className="mt-6">
            <h4 className="border-b border-border-subtle pb-2 text-md font-semibold text-fg">
              {s.title || 'Untitled section'}
            </h4>
            <ol className="mt-3 flex flex-col gap-4">
              {s.questions.map((q) => {
                const num = ++n;
                const value = answers[q.id] ?? [];
                return (
                  <li key={q.id} className="rounded-lg border border-border-subtle bg-card p-4">
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 text-base text-fg">
                        <span className="mr-1.5 font-semibold tnum">{num}.</span>
                        {q.prompt || <span className="text-fg-subtle">No question text yet</span>}
                      </p>
                      <Badge size="sm">
                        {q.points} {q.points === 1 ? 'point' : 'points'}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      {q.type === 'single' && (
                        <RadioGroup
                          aria-label={`Answer to question ${num}`}
                          value={value[0] ?? null}
                          onValueChange={(v) => set(q.id, [v])}
                          options={q.options.map((o) => ({ value: o.id, label: o.text || '—' }))}
                        />
                      )}
                      {q.type === 'multi' && (
                        <div className="flex flex-col gap-2.5">
                          <p className="text-xs text-fg-subtle">Select all that apply.</p>
                          {q.options.map((o) => (
                            <Checkbox
                              key={o.id}
                              label={o.text || '—'}
                              checked={value.includes(o.id)}
                              onCheckedChange={(on) =>
                                set(q.id, on ? [...value, o.id] : value.filter((x) => x !== o.id))
                              }
                            />
                          ))}
                        </div>
                      )}
                      {q.type === 'short' && (
                        <Input
                          aria-label={`Answer to question ${num}`}
                          value={value[0] ?? ''}
                          onChange={(e) => set(q.id, [e.currentTarget.value])}
                        />
                      )}
                      {q.type === 'long' && (
                        <Textarea
                          aria-label={`Answer to question ${num}`}
                          minRows={4}
                          value={value[0] ?? ''}
                          onChange={(e) => set(q.id, [e.currentTarget.value])}
                        />
                      )}
                      {q.type === 'code' && (
                        <Textarea
                          aria-label={`Code answer to question ${num}`}
                          description={q.language}
                          minRows={5}
                          spellCheck={false}
                          textareaClassName="font-mono text-sm"
                          value={value[0] ?? q.starterCode}
                          onChange={(e) => set(q.id, [e.currentTarget.value])}
                        />
                      )}
                      {q.type === 'file' && (
                        <FileDrop
                          file={files[q.id] ?? null}
                          onFile={(f) => setFiles((x) => ({ ...x, [q.id]: f }))}
                          accept={q.accept || undefined}
                          hint={q.accept ? `Accepted: ${q.accept}` : 'Any file'}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        <div className="mt-6 flex justify-end">
          <Button disabled>Submit assessment</Button>
        </div>
      </div>
    </div>
  );
}
