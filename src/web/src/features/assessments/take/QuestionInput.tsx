'use client';

import { useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { FileUp, Paperclip, X } from 'lucide-react';
import { Badge, Button, Input, Spinner, Textarea } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/cn';
import { CodeEditor } from '../CodeEditor';
import { plural, uploadTypes, type QuestionType } from '../scoring';

/** A question as the candidate's browser gets it: no correct answers, no scoring notes. */
export type CandidateQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: { id: string; text: string }[];
  language: string;
  starterCode: string;
  accept: string;
};

export type AnswerValue = {
  choiceIds: string[];
  text: string;
  file: { id: string; name: string; length: number } | null;
};

export const emptyAnswer: AnswerValue = { choiceIds: [], text: '', file: null };

export const isAnswered = (q: CandidateQuestion, a: AnswerValue | undefined) =>
  !!a &&
  (q.type === 'single' || q.type === 'multi'
    ? a.choiceIds.length > 0
    : q.type === 'file'
      ? !!a.file
      : q.type === 'code'
        ? a.text.trim() !== '' && a.text.trim() !== q.starterCode.trim()
        : a.text.trim() !== '');

const hints: Record<QuestionType, string> = {
  single: 'Choose one answer.',
  multi: 'Choose every answer that applies.',
  short: 'Write a short answer.',
  long: 'Write your answer.',
  code: 'Write your code. It is read by a person; it is not run.',
  file: 'Upload a file.',
};

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * One question for the candidate: prompt and the right input for its type. The builder's
 * "Preview as candidate" renders the same component, so the two never drift apart.
 */
export function QuestionInput({
  question: q,
  number,
  value,
  onChange,
  disabled,
  onPaste,
  onUpload,
  onRemoveFile,
  uploading,
  marked,
  onToggleMark,
}: {
  question: CandidateQuestion;
  number: number;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
  /** Paste anywhere in an answer; call `preventDefault()` to block it. */
  onPaste?: (event: ClipboardEvent | ReactClipboardEvent) => void;
  onUpload?: (file: File) => void;
  onRemoveFile?: () => void;
  uploading?: boolean;
  marked?: boolean;
  onToggleMark?: () => void;
}) {
  const labelId = `q-${q.id}-label`;
  const accept = q.accept.trim() || uploadTypes.join(',');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={labelId} className="text-sm font-semibold text-fg tnum">
          Question {number}
        </h3>
        <Badge size="sm">{plural(q.points, 'point')}</Badge>
        {onToggleMark && (
          <Button
            variant={marked ? 'soft' : 'quiet'}
            size="xs"
            className="ml-auto"
            aria-pressed={marked}
            onClick={onToggleMark}
          >
            {marked ? 'Marked to check again' : 'Mark to check again'}
          </Button>
        )}
      </div>
      <RichText markdown={q.prompt || '_No question text yet._'} className="mt-2 text-md text-fg" />
      <p className="mt-2 text-xs text-fg-subtle">{hints[q.type]}</p>

      <div className="mt-3" onPaste={onPaste}>
        {(q.type === 'single' || q.type === 'multi') && (
          <fieldset aria-labelledby={labelId} className="flex flex-col gap-2" disabled={disabled}>
            {q.options.map((o) => {
              const checked = value.choiceIds.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-base text-fg transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    checked ? 'border-primary bg-accent' : 'border-border hover:bg-muted',
                    disabled && 'cursor-default opacity-70 hover:bg-transparent',
                  )}
                >
                  <input
                    type={q.type === 'single' ? 'radio' : 'checkbox'}
                    name={`q-${q.id}`}
                    checked={checked}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        choiceIds:
                          q.type === 'single'
                            ? [o.id]
                            : e.currentTarget.checked
                              ? [...value.choiceIds, o.id]
                              : value.choiceIds.filter((x) => x !== o.id),
                      })
                    }
                    className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-none"
                  />
                  <span className="min-w-0 break-words">{o.text || 'Empty answer'}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {q.type === 'short' && (
          <Input
            aria-labelledby={labelId}
            maxLength={500}
            value={value.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, text: e.currentTarget.value })}
          />
        )}
        {q.type === 'long' && (
          <Textarea
            aria-labelledby={labelId}
            minRows={6}
            maxRows={24}
            value={value.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, text: e.currentTarget.value })}
          />
        )}
        {q.type === 'code' && (
          <CodeEditor
            aria-label={`Code for question ${number}`}
            language={q.language}
            value={value.text || q.starterCode}
            readOnly={disabled}
            onChange={(text) => onChange({ ...value, text })}
            onPaste={onPaste}
            minHeight="220px"
          />
        )}
        {q.type === 'file' && (
          <FileAnswer
            accept={accept}
            file={value.file}
            disabled={disabled}
            uploading={uploading}
            onUpload={onUpload}
            onRemove={onRemoveFile}
          />
        )}
      </div>
    </div>
  );
}

function FileAnswer({
  accept,
  file,
  disabled,
  uploading,
  onUpload,
  onRemove,
}: {
  accept: string;
  file: AnswerValue['file'];
  disabled?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const types = accept
    .split(',')
    .map((x) => x.trim().replace('.', '').toUpperCase())
    .join(', ');
  if (file)
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
        <Paperclip className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-fg">{file.name}</p>
          <p className="text-xs text-fg-subtle">{fileSize(file.length)} · Uploaded</p>
        </div>
        {!disabled && onRemove && (
          <Button variant="quiet" size="sm" leftIcon={<X />} onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    );
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped && !disabled) onUpload?.(dropped);
      }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
        over ? 'border-primary bg-accent' : 'border-border bg-muted',
      )}
    >
      {uploading ? (
        <Spinner label="Uploading" />
      ) : (
        <FileUp className="size-6 text-fg-subtle" aria-hidden />
      )}
      <p className="text-sm text-fg-muted">
        {uploading ? 'Uploading your file…' : 'Drag your file here, or choose it.'}
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => input.current?.click()}
      >
        Choose file
      </Button>
      <p className="text-2xs text-fg-subtle">{types}. Up to 25 MB.</p>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (picked) onUpload?.(picked);
        }}
      />
    </div>
  );
}
