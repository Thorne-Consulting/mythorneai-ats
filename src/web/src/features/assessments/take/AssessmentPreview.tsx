'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import type { Content } from '../scoring';
import { emptyAnswer, QuestionInput, type AnswerValue } from './QuestionInput';

/** The builder's "Preview as candidate": the same question renderer, with answers kept on this screen only. */
export function AssessmentPreview({ content }: { content: Content }) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  let n = 0;
  return (
    <div className="rounded-xl border border-border-subtle bg-background">
      <p className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-xs text-fg-subtle">
        <Eye className="size-3.5" aria-hidden />
        What applicants see. Answers here are not saved.
      </p>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 sm:px-6">
        {content.sections.map((s) => (
          <section key={s.id} aria-label={s.title}>
            <h3 className="border-b border-border-subtle pb-2 text-md font-semibold text-fg">
              {s.title || 'Untitled section'}
            </h3>
            <ol className="mt-4 flex flex-col gap-4">
              {s.questions.map((q) => {
                const number = ++n;
                return (
                  <li
                    key={q.id}
                    className="rounded-xl border border-border-subtle bg-card p-4 sm:p-5"
                  >
                    <QuestionInput
                      question={q}
                      number={number}
                      value={answers[q.id] ?? emptyAnswer}
                      onChange={(value) => setAnswers((a) => ({ ...a, [q.id]: value }))}
                      onUpload={(file) =>
                        setAnswers((a) => ({
                          ...a,
                          [q.id]: {
                            ...emptyAnswer,
                            file: { id: 'preview', name: file.name, length: file.size },
                          },
                        }))
                      }
                      onRemoveFile={() => setAnswers((a) => ({ ...a, [q.id]: emptyAnswer }))}
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
