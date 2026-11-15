'use client';

import { useState } from 'react';
import { CircleAlert, FileText, X } from 'lucide-react';
import {
  Checkbox,
  Fieldset,
  FileDrop,
  Input,
  RadioGroup,
  Spinner,
  Textarea,
} from '@/components/ui';
import { errorText, OFFLINE } from './public-api';
import type { Answer, PublicQuestion } from './questions';

const FILE_TYPES = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

/**
 * One application question as the right control: a box for text, numbers, dates and links,
 * choices as radio buttons or checkboxes, and a file picker that uploads straight away.
 * `id` is what the error summary focuses.
 */
export function AnswerField({
  id,
  question: q,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  question: PublicQuestion;
  value: Answer | undefined;
  error?: string;
  onChange: (answer: Answer) => void;
  onBlur: () => void;
}) {
  const text = value?.values[0] ?? '';
  const setText = (v: string) => onChange({ values: [v] });
  const common = {
    id,
    label: q.label,
    description: q.helpText || undefined,
    required: q.required,
    error,
    onBlur,
  };
  switch (q.type) {
    case 'LongText':
      return (
        <Textarea
          {...common}
          minRows={3}
          maxLength={5000}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      );
    case 'Number':
      return (
        <Input
          {...common}
          inputMode="decimal"
          className="max-w-[240px]"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      );
    case 'Date':
      return (
        <Input
          {...common}
          type="date"
          className="max-w-[240px]"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      );
    case 'Url':
      return (
        <Input
          {...common}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      );
    case 'YesNo':
    case 'SingleChoice':
    case 'MultipleChoice':
      return (
        <Choice
          id={id}
          question={q}
          value={value}
          error={error}
          onChange={onChange}
          onBlur={onBlur}
        />
      );
    case 'File':
      return <FileAnswer id={id} question={q} value={value} error={error} onChange={onChange} />;
    default:
      return (
        <Input
          {...common}
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      );
  }
}

function Legend({ question: q }: { question: PublicQuestion }) {
  return (
    <>
      {q.label}
      {q.required && (
        <span className="text-destructive" aria-hidden>
          {' '}
          *
        </span>
      )}
    </>
  );
}

function ErrorLine({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-destructive">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      {error}
    </p>
  );
}

function Choice({
  id,
  question: q,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  question: PublicQuestion;
  value: Answer | undefined;
  error?: string;
  onChange: (answer: Answer) => void;
  onBlur: () => void;
}) {
  const picked = value?.values ?? [];
  return (
    <Fieldset legend={<Legend question={q} />} description={q.helpText || undefined}>
      {/* Focus target for the error summary. */}
      <div id={id} tabIndex={-1} onBlur={onBlur} className="focus-visible:outline-none">
        {q.type === 'MultipleChoice' ? (
          <div className="flex flex-col gap-2.5">
            {q.options.map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={picked.includes(option)}
                onCheckedChange={(on) =>
                  onChange({
                    values: on
                      ? q.options.filter((o) => o === option || picked.includes(o))
                      : picked.filter((o) => o !== option),
                  })
                }
              />
            ))}
          </div>
        ) : (
          <RadioGroup
            aria-label={q.label}
            orientation={q.type === 'YesNo' ? 'horizontal' : 'vertical'}
            value={picked[0] ?? null}
            onValueChange={(v) => onChange({ values: [v] })}
            options={q.options.map((o) => ({ value: o, label: o }))}
          />
        )}
      </div>
      <ErrorLine error={error} />
    </Fieldset>
  );
}

function FileAnswer({
  id,
  question: q,
  value,
  error,
  onChange,
}: {
  id: string;
  question: PublicQuestion;
  value: Answer | undefined;
  error?: string;
  onChange: (answer: Answer) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  async function pick(file: File | null) {
    setProblem('');
    if (!file) return;
    if (file.size === 0 || file.size > 10 * 1024 * 1024)
      return setProblem('Choose a file that is under 10 MB.');
    setBusy(file.name);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/public/answer-file', { method: 'POST', body });
      if (!response.ok)
        throw new Error(await errorText(response, 'We could not upload that file. Try again.'));
      const result = (await response.json()) as { fileToken: string; fileName: string };
      onChange({ values: [], fileToken: result.fileToken, fileName: result.fileName });
    } catch (e) {
      setProblem(e instanceof TypeError ? OFFLINE : (e as Error).message);
    }
    setBusy(null);
  }
  return (
    <Fieldset legend={<Legend question={q} />} description={q.helpText || undefined}>
      <div id={id} tabIndex={-1} className="focus-visible:outline-none">
        {value?.fileToken || busy ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
            {busy ? (
              <Spinner className="size-5 text-fg-subtle" />
            ) : (
              <FileText className="size-5 shrink-0 text-fg-subtle" aria-hidden />
            )}
            <p className="min-w-0 flex-1 truncate text-base font-medium text-fg">
              {busy ?? value?.fileName}
            </p>
            {!busy && (
              <button
                type="button"
                onClick={() => onChange({ values: [] })}
                aria-label={`Remove the file for: ${q.label}`}
                className="rounded-sm p-1 text-fg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <FileDrop
            file={null}
            onFile={pick}
            accept={FILE_TYPES}
            hint="PDF, Word, PNG or JPEG, up to 10 MB"
            label="Drop a file here or browse"
          />
        )}
      </div>
      <ErrorLine error={problem || error} />
    </Fieldset>
  );
}
