'use client';

import { CheckCircle2 } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import type { InviteRow, InviteStatus } from './api';
import { CodeEditor } from './CodeEditor';
import { isAutoScored, plural, questionTypeLabels, type Question } from './scoring';

/** Where one attempt is, in words and colour (amber means the team has work to do). */
export function inviteState(row: Pick<InviteRow, 'status' | 'decision' | 'replaced'>): {
  label: string;
  tone: Tone;
} {
  if (row.replaced) return { label: 'Replaced by a retake', tone: 'gray' };
  if (row.decision === 'Passed') return { label: 'Passed', tone: 'green' };
  if (row.decision === 'Failed') return { label: 'Failed', tone: 'red' };
  const map: Record<InviteStatus, { label: string; tone: Tone }> = {
    NotStarted: { label: 'Not started', tone: 'gray' },
    InProgress: { label: 'In progress', tone: 'blue' },
    Submitted: { label: 'To review', tone: 'amber' },
    Expired: { label: 'Expired', tone: 'gray' },
    Revoked: { label: 'Revoked', tone: 'gray' },
  };
  return map[row.status];
}

export function InviteStatusBadge({
  row,
}: {
  row: Pick<InviteRow, 'status' | 'decision' | 'replaced'>;
}) {
  const s = inviteState(row);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** "83%", "12 of 28 points so far", or nothing yet. */
export function scoreText(
  row: Pick<InviteRow, 'status' | 'percent' | 'earned' | 'max' | 'pending'>,
) {
  if (row.percent !== null) return `${row.percent}%`;
  if (row.status === 'Submitted') return `${row.earned} of ${row.max} points so far`;
  return null;
}

export function ScoreCell({ row }: { row: InviteRow }) {
  const text = scoreText(row);
  if (!text) return <span className="text-fg-subtle">None yet</span>;
  return row.percent !== null ? (
    <span className="font-semibold text-fg tnum">{text}</span>
  ) : (
    <span className="whitespace-nowrap text-fg-muted tnum">{text}</span>
  );
}

/** A question as the team sees it: prompt, correct answers marked, and how to score it. */
export function QuestionView({ q, number }: { q: Question; number: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg tnum">Question {number}</span>
        <Badge size="sm">{questionTypeLabels[q.type]}</Badge>
        <Badge size="sm" tone="blue">
          {plural(q.points, 'point')}
        </Badge>
        {q.partialCredit && <Badge size="sm">Partial credit</Badge>}
      </div>
      <RichText markdown={q.prompt} className="mt-2 text-base text-fg" />
      {isAutoScored(q) && (
        <ul className="mt-3 space-y-1.5">
          {q.options.map((o) => (
            <li key={o.id} className="flex items-start gap-2 text-sm">
              {o.correct ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-tone-green-fg"
                  aria-label="Correct"
                />
              ) : (
                <span className="size-4 shrink-0" aria-hidden />
              )}
              <span className={o.correct ? 'font-medium text-fg' : 'text-fg-muted'}>{o.text}</span>
            </li>
          ))}
        </ul>
      )}
      {q.type === 'code' && q.starterCode && (
        <CodeEditor
          className="mt-3"
          aria-label={`Starter code for question ${number}`}
          language={q.language}
          value={q.starterCode}
          readOnly
          minHeight="0px"
          maxHeight="280px"
        />
      )}
      {q.type === 'file' && (
        <p className="mt-2 text-xs text-fg-subtle">
          Takes {q.accept || 'any allowed file'}, up to 25 MB.
        </p>
      )}
      {q.rubric && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2">
          <p className="text-xs font-medium text-fg">How to score</p>
          <RichText markdown={q.rubric} className="mt-0.5 text-sm text-fg-muted" />
        </div>
      )}
    </div>
  );
}
