'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CircleDot, ExternalLink, NotebookPen, Plus, Timer, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  IconButton,
  Input,
  Kbd,
  SkeletonRows,
  Textarea,
} from '@/components/ui';
import { InterviewQuestions } from '@/features/applications/InterviewQuestions';
import { cn } from '@/lib/cn';
import { useHotkeys } from '@/lib/hooks';
import { safeWebUrl } from '@/lib/safe-url';
import { TabNotice, useInterviewRecord } from './InterviewRecord';
import { ResumeSummary } from './InterviewOverview';
import { interviewHref } from './interview-api';
import { isGeneral, useMyNotes, type NoteItem } from './interview-notes';
import { SaveStatus } from './SaveStatus';

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * The room: what to use while the interview runs. A timer against the end, the kit's questions
 * with a note and a "covered" tick each, my own added questions, and the resume beside them.
 * Notes save to the server as you type and wait beside your scorecard.
 */
export function InterviewRoom() {
  const { interview, candidate, state, assigned, canManage, submitted } = useInterviewRecord();
  const notes = useMyNotes(interview.id);
  const [active, setActive] = useState(0);
  const [newQuestion, setNewQuestion] = useState('');
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  // Every kit question has a row, saved or not; then the questions I added.
  const rows = useMemo(() => {
    const byCriterion = new Map(
      notes.items.filter((x) => x.criterionId).map((x) => [x.criterionId, x]),
    );
    return [
      ...interview.criteria.map((criterion) => ({
        criterion,
        note: byCriterion.get(criterion.id) ?? {
          criterionId: criterion.id,
          question: null,
          body: '',
          covered: false,
        },
      })),
      ...notes.items.filter((x) => x.question).map((note) => ({ criterion: null, note })),
    ];
  }, [interview.criteria, notes.items]);
  const general = notes.items.find(isGeneral) ?? {
    criterionId: null,
    question: null,
    body: '',
    covered: false,
  };

  const keyOf = (item: NoteItem) =>
    item.criterionId ? `c:${item.criterionId}` : item.question ? `q:${item.question}` : 'general';
  const write = (target: NoteItem, change: Partial<NoteItem>) => {
    const next = { ...target, ...change };
    const key = keyOf(target);
    const exists = notes.items.some((item) => keyOf(item) === key);
    notes.update(
      (exists
        ? notes.items.map((item) => (keyOf(item) === key ? next : item))
        : [...notes.items, next]
      )
        // An untouched kit question needs no row.
        .filter((item) => !item.criterionId || item.body.trim() || item.covered),
    );
  };
  const addQuestion = (question: string) => {
    const text = question.trim();
    if (!text || notes.items.some((x) => x.question === text)) return;
    notes.update([...notes.items, { criterionId: null, question: text, body: '', covered: false }]);
  };
  const removeQuestion = (target: NoteItem) =>
    notes.update(notes.items.filter((item) => keyOf(item) !== keyOf(target)));

  const move = (by: number) => {
    const next = Math.min(Math.max(active + by, 0), rows.length - 1);
    setActive(next);
    refs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  useHotkeys(
    [
      ['j', () => move(1)],
      ['k', () => move(-1)],
      [
        'mod+enter',
        () => rows[active] && write(rows[active].note, { covered: !rows[active].note.covered }),
      ],
    ],
    true,
  );

  if (state.key === 'cancelled')
    return (
      <TabNotice title="This interview was cancelled" description="There is nothing to run." />
    );
  if (!assigned && !canManage)
    return (
      <TabNotice
        title="The room is for the panel"
        description="Only the interviewers take notes here."
      />
    );

  const covered = rows.filter((row) => row.note.covered).length;
  return (
    <div className="space-y-4">
      <RoomBar covered={covered} total={rows.length} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Questions"
              description={
                rows.length > 0 && (
                  <>
                    <Kbd>J</Kbd> and <Kbd>K</Kbd> move between questions. <Kbd>⌘</Kbd>{' '}
                    <Kbd>Enter</Kbd> marks one covered.
                  </>
                )
              }
              action={
                <InterviewQuestions
                  applicationId={interview.applicationId}
                  interviewKitId={interview.interviewKitId}
                  candidateName={candidate.name}
                  onAdd={addQuestion}
                  added={notes.items.flatMap((x) => (x.question ? [x.question] : []))}
                />
              }
            />
            <CardBody className="space-y-3">
              {interview.interviewKitInstructions && (
                <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap text-fg">
                  {interview.interviewKitInstructions}
                </p>
              )}
              {notes.loading ? (
                <SkeletonRows rows={4} className="p-0" />
              ) : rows.length === 0 ? (
                <p className="text-sm text-fg-subtle">
                  This interview has no kit. Add your own questions below, or use Suggest questions.
                </p>
              ) : (
                <ol className="space-y-2">
                  {rows.map((row, index) => (
                    <li
                      key={row.criterion?.id ?? row.note.question}
                      ref={(element) => {
                        refs.current[index] = element;
                      }}
                      onFocusCapture={() => setActive(index)}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        index === active ? 'border-primary bg-accent/40' : 'border-border-subtle',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          aria-label={`Covered: ${row.criterion?.name ?? row.note.question}`}
                          checked={row.note.covered}
                          onCheckedChange={(checked) =>
                            write(row.note, { covered: checked === true })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-fg-subtle">
                            <span className="tnum">{index + 1}.</span>{' '}
                            {row.criterion ? row.criterion.name : 'Your question'}
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-base text-fg',
                              row.note.covered && 'text-fg-muted line-through',
                            )}
                          >
                            {row.criterion?.question ?? row.note.question}
                          </p>
                          {row.criterion?.description && (
                            <p className="mt-0.5 text-xs text-fg-subtle">
                              What good looks like: {row.criterion.description}
                            </p>
                          )}
                        </div>
                        {!row.criterion && (
                          <IconButton
                            size="sm"
                            variant="quiet"
                            label="Remove this question"
                            onClick={() => removeQuestion(row.note)}
                          >
                            <Trash2 />
                          </IconButton>
                        )}
                      </div>
                      <Textarea
                        aria-label={`Notes on ${row.criterion?.name ?? row.note.question}`}
                        className="mt-2"
                        minRows={index === active ? 3 : 1}
                        placeholder="What they said, with examples"
                        value={row.note.body}
                        onChange={(event) => write(row.note, { body: event.currentTarget.value })}
                      />
                    </li>
                  ))}
                </ol>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  addQuestion(newQuestion);
                  setNewQuestion('');
                }}
              >
                <Input
                  label="Add your own question"
                  className="flex-1"
                  maxLength={1000}
                  value={newQuestion}
                  onChange={(event) => setNewQuestion(event.currentTarget.value)}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  leftIcon={<Plus />}
                  disabled={!newQuestion.trim()}
                >
                  Add
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Other notes" />
            <CardBody className="space-y-1.5">
              <Textarea
                aria-label="Other notes"
                minRows={4}
                placeholder="Anything that does not fit a question"
                value={general.body}
                onChange={(event) => write(general, { body: event.currentTarget.value })}
              />
              <SaveStatus state={notes.state} onRetry={notes.retry} />
            </CardBody>
          </Card>

          {assigned && !submitted && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <NotebookPen className="size-5 text-tone-blue-dot" aria-hidden />
                  <p className="text-base text-fg">
                    Done? Write your scorecard while it is fresh. Your notes sit beside it.
                  </p>
                </div>
                <Button asChild>
                  <Link href={interviewHref(interview.id, 'feedback')}>Write scorecard</Link>
                </Button>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="min-w-0 lg:sticky lg:top-[101px] lg:self-start">
          <ResumeSummary candidateId={candidate.id} />
        </div>
      </div>
    </div>
  );
}

/** Sticky: the clock against the end, a nudge near the end, Join and Record. */
function RoomBar({ covered, total }: { covered: number; total: number }) {
  const { interview, state } = useInterviewRecord();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const start = new Date(interview.startsAt).getTime();
  const end = new Date(interview.endsAt).getTime();
  const join = safeWebUrl(interview.meetingLink);
  const before = now < start;
  const left = end - now;
  const soonOver = !before && left > 0 && left <= 5 * 60_000;
  return (
    <div className="sticky top-[89px] z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border-subtle bg-card px-4 py-3 shadow-card">
      <span className="flex items-center gap-2 text-md font-semibold text-fg tnum" aria-live="off">
        <Timer className="size-5 text-fg-subtle" aria-hidden />
        {before
          ? `Starts in ${clock(start - now)}`
          : left > 0
            ? `${clock(now - start)} in · ${clock(left)} left`
            : `Over by ${clock(-left)}`}
      </span>
      {soonOver && (
        <Badge tone="amber" dot>
          5 minutes left. Leave time for their questions.
        </Badge>
      )}
      {state.key === 'live' && (
        <Badge tone="green" dot>
          Live now
        </Badge>
      )}
      {total > 0 && (
        <span className="flex items-center gap-1.5 text-sm text-fg-muted tnum">
          <Check className="size-4 text-tone-green-dot" aria-hidden />
          {covered} of {total} covered
        </span>
      )}
      <span className="ml-auto flex flex-wrap gap-2">
        {!before && (
          <Button asChild size="sm" variant="secondary">
            <Link href={interviewHref(interview.id, 'recording')}>
              <CircleDot className="text-tone-red-dot" />
              Record
            </Link>
          </Button>
        )}
        {join && (
          <Button asChild size="sm">
            <a href={join} target="_blank" rel="noreferrer">
              Join meeting
              <ExternalLink />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
      </span>
    </div>
  );
}
