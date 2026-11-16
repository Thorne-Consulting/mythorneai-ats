'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  EyeOff,
  FileText,
  Lock,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FileButton,
  Modal,
  NumberInput,
  PageHeader,
  RadioGroup,
  SegmentedControl,
  SkeletonRows,
  Textarea,
  Timeline,
  toast,
} from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, humanize } from '@/lib/format';
import {
  resultHref,
  useRefreshAssessments,
  useReview,
  type Decision,
  type Review,
  type ReviewAnswer,
} from './api';
import { CodeEditor } from './CodeEditor';
import { inviteState } from './parts';
import {
  autoPoints,
  duration,
  integritySummary,
  isAutoScored,
  lineDiff,
  plural,
  questionTypeLabels,
  type IntegrityEvent,
  type Question,
} from './scoring';

type QState = 'right' | 'partly' | 'wrong' | 'todo' | 'scored' | 'blank';

const historyLabels: Record<string, string> = {
  AssessmentSent: 'Sent',
  AssessmentRetakeSent: 'Retake sent',
  AssessmentStarted: 'Started',
  AssessmentSubmitted: 'Submitted',
  AssessmentTimeRanOut: 'Time ran out, answers submitted',
  AssessmentReminderSent: 'Reminder sent',
  AssessmentDeadlineChanged: 'Deadline changed',
  AssessmentPassed: 'Marked as passed',
  AssessmentFailed: 'Marked as failed',
  AssessmentGradingReopened: 'Grading reopened',
  AssessmentResultRecorded: 'Result entered',
};

const eventLabels: Record<string, string> = {
  left: 'Left the tab',
  returned: 'Came back',
  'fullscreen-exit': 'Left full screen',
  paste: 'Pasted',
  'paste-blocked': 'Tried to paste (blocked)',
};

/** One result: question by question, reviewer scores against the rubric, checks, and the locked decision. */
export function ResultReview({ id, resultId }: { id: string; resultId: string }) {
  const router = useRouter();
  const query = useReview(resultId);
  const refresh = useRefreshAssessments();
  const [index, setIndex] = useState(0);

  const r = query.data;
  const questions = r ? r.sections.flatMap((s) => s.questions) : [];
  const last = Math.max(0, questions.length - 1);

  // ← and → move between questions, except while typing or inside a control that uses arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        t &&
        (t.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
          t.closest('[role=radiogroup],[role=tablist],.cm-editor'))
      )
        return;
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(last, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const who = r ? (r.candidate?.name ?? r.blindName) : 'Result';
  const crumbs = [
    { label: 'Assessments', href: '/assessments' },
    ...(r
      ? [{ label: r.assessment.name, href: `/assessments/${r.assessment.id}?tab=results` }]
      : []),
    { label: who },
  ];
  if (query.isError)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Result not found" />
        <Card>
          <EmptyState
            icon={FileText}
            title="Nothing to review here"
            description="The link may be old, or the result was removed. Go back to pick another result."
            action={
              <Button asChild variant="secondary">
                <Link href={`/assessments/${id}?tab=results`}>Back to results</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  if (!r)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Result" />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );

  const state = inviteState({ status: r.status, decision: r.decision, replaced: false });
  const answers = new Map(r.answers.map((a) => [a.questionId, a]));
  const q = questions[Math.min(index, last)];
  const reload = () => {
    query.refetch();
    refresh();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {who}
            <Badge tone={state.tone}>{state.label}</Badge>
          </span>
        }
        description={[
          r.job.title,
          r.attempt > 1 ? `Attempt ${r.attempt}` : null,
          `Version ${r.versionNumber}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {r.applicationId && (
              <Button asChild variant="secondary">
                <Link href={`/applications/${r.applicationId}`}>Open application</Link>
              </Button>
            )}
            {r.next && (
              <Button
                variant="secondary"
                rightIcon={<ChevronRight />}
                onClick={() => router.push(resultHref(r.next!.assessmentId, r.next!.id))}
              >
                Next to review
              </Button>
            )}
          </>
        }
      />
      {r.blind && (
        <Alert tone="info" icon={EyeOff} className="mb-5">
          Grading without names. You see who this is after you record a decision.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {r.assessment.kind === 'External' ? (
            <ExternalResult r={r} onSaved={reload} />
          ) : r.status !== 'Submitted' ? (
            <Card>
              <EmptyState
                icon={Clock}
                title={r.status === 'InProgress' ? 'Still working on it' : 'Not finished'}
                description={
                  r.status === 'InProgress'
                    ? `Answers show here when they submit${r.deadlineAt ? ` or when time runs out at ${formatDateTime(r.deadlineAt)}` : ''}.`
                    : 'This attempt has no answers to review.'
                }
              />
            </Card>
          ) : (
            q && (
              <Card>
                <nav aria-label="Questions" className="border-b border-border-subtle px-5 py-4">
                  <ol className="flex flex-wrap gap-1.5">
                    {questions.map((qq, i) => {
                      const st = stateOf(qq, answers.get(qq.id));
                      return (
                        <li key={qq.id}>
                          <button
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-current={i === index ? 'step' : undefined}
                            aria-label={`Question ${i + 1}, ${stateText[st]}`}
                            className={cn(
                              'flex size-8 items-center justify-center rounded-md border text-sm font-medium tnum transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                              st === 'right' &&
                                'border-transparent bg-tone-green-bg text-tone-green-fg',
                              st === 'partly' &&
                                'border-transparent bg-tone-amber-bg text-tone-amber-fg',
                              st === 'wrong' &&
                                'border-transparent bg-tone-red-bg text-tone-red-fg',
                              st === 'todo' &&
                                'border-dashed border-tone-amber-dot text-tone-amber-fg',
                              st === 'scored' &&
                                'border-transparent bg-tone-blue-bg text-tone-blue-fg',
                              st === 'blank' && 'border-border-subtle text-fg-subtle',
                              i === index && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                            )}
                          >
                            {i + 1}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-2 hidden text-2xs text-fg-subtle sm:block">
                    Use ← and → to move between questions.
                  </p>
                </nav>
                <QuestionReview
                  key={q.id}
                  r={r}
                  q={q}
                  number={index + 1}
                  total={questions.length}
                  answer={answers.get(q.id)}
                  onSaved={reload}
                />
                <div className="flex justify-between gap-2 border-t border-border-subtle px-5 py-4">
                  <Button
                    variant="secondary"
                    leftIcon={<ChevronLeft />}
                    disabled={index === 0}
                    onClick={() => setIndex(index - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    rightIcon={<ChevronRight />}
                    disabled={index >= last}
                    onClick={() => setIndex(index + 1)}
                  >
                    Next question
                  </Button>
                </div>
              </Card>
            )
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5" aria-label="Score and decision">
          <ScoreCard r={r} />
          <DecisionCard r={r} onSaved={reload} />
          {r.assessment.kind === 'Native' && r.startedAt && (
            <ChecksCard r={r} questions={questions} />
          )}
          <HistoryCard r={r} />
        </aside>
      </div>
    </>
  );
}

const stateText: Record<QState, string> = {
  right: 'correct',
  partly: 'partly correct',
  wrong: 'incorrect',
  todo: 'needs a score',
  scored: 'scored',
  blank: 'no answer',
};

function isBlank(q: Question, a: ReviewAnswer | undefined) {
  if (!a) return true;
  if (isAutoScored(q)) return a.choiceIds.length === 0;
  if (q.type === 'file') return !a.file;
  const text = (a.text ?? '').trim();
  return !text || (q.type === 'code' && text === q.starterCode.trim());
}

function stateOf(q: Question, a: ReviewAnswer | undefined): QState {
  if (isAutoScored(q)) {
    const points = a?.autoPoints ?? autoPoints(q, a?.choiceIds);
    return points >= q.points ? 'right' : points > 0 ? 'partly' : 'wrong';
  }
  if (isBlank(q, a)) return 'blank';
  return a!.reviewerPoints === null ? 'todo' : 'scored';
}

function QuestionReview({
  r,
  q,
  number,
  total,
  answer,
  onSaved,
}: {
  r: Review;
  q: Question;
  number: number;
  total: number;
  answer: ReviewAnswer | undefined;
  onSaved: () => void;
}) {
  const blank = isBlank(q, answer);
  const auto = isAutoScored(q);
  const events = r.integrity.filter((e) => e.questionId === q.id && e.type !== 'returned');
  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-subtle tnum">
          Question {number} of {total}
        </span>
        <Badge size="sm">{questionTypeLabels[q.type]}</Badge>
        <Badge size="sm" tone="blue">
          {plural(q.points, 'point')}
        </Badge>
        {answer && answer.seconds > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <Clock className="size-3.5" aria-hidden />
            {duration(answer.seconds)} on this question
          </span>
        )}
      </div>
      <RichText markdown={q.prompt} className="mt-2 text-md text-fg" />

      <h3 className="mt-5 mb-2 text-sm font-semibold text-fg">Answer</h3>
      {auto ? (
        <ul className="flex flex-col gap-1.5">
          {q.options.map((o) => {
            const picked = answer?.choiceIds.includes(o.id) ?? false;
            return (
              <li
                key={o.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  picked ? 'border-primary bg-accent' : 'border-border-subtle',
                )}
              >
                <span className="min-w-0 flex-1 break-words text-fg">{o.text}</span>
                {picked && <Badge size="sm">Chosen</Badge>}
                {o.correct && (
                  <Badge size="sm" tone="green">
                    Correct
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      ) : blank ? (
        <p className="rounded-md bg-muted p-3 text-sm text-fg-subtle">
          No answer. Scored 0 automatically.
        </p>
      ) : q.type === 'code' ? (
        <CodeAnswer q={q} text={answer!.text ?? ''} number={number} />
      ) : q.type === 'file' ? (
        <FileAnswer file={answer!.file!} />
      ) : (
        <p className="rounded-md bg-muted p-3 text-base whitespace-pre-wrap break-words text-fg">
          {answer!.text}
        </p>
      )}
      {events.length > 0 && (
        <p className="mt-2 text-xs text-fg-subtle">
          During this question:{' '}
          {events.map((e) => eventLabels[e.type]?.toLowerCase() ?? e.type).join(', ')}.
        </p>
      )}

      {auto ? (
        <AutoResult q={q} answer={answer} />
      ) : (
        !blank && <RubricScore r={r} q={q} answer={answer!} onSaved={onSaved} />
      )}
    </div>
  );
}

function AutoResult({ q, answer }: { q: Question; answer: ReviewAnswer | undefined }) {
  const points = answer?.autoPoints ?? autoPoints(q, answer?.choiceIds);
  const right = points >= q.points;
  return (
    <p
      className={cn(
        'mt-4 inline-flex items-center gap-1.5 text-sm font-medium',
        right ? 'text-tone-green-fg' : points > 0 ? 'text-tone-amber-fg' : 'text-tone-red-fg',
      )}
    >
      {right ? (
        <CheckCircle2 className="size-4" aria-hidden />
      ) : (
        <XCircle className="size-4" aria-hidden />
      )}
      Scored automatically: {points} of {plural(q.points, 'point')}
    </p>
  );
}

function CodeAnswer({ q, text, number }: { q: Question; text: string; number: number }) {
  const [view, setView] = useState<'answer' | 'changes'>('answer');
  return (
    <div className="flex flex-col gap-2">
      {q.starterCode.trim() && (
        <SegmentedControl
          size="sm"
          aria-label="Code view"
          value={view}
          onValueChange={(v) => setView(v as 'answer' | 'changes')}
          items={[
            { value: 'answer', label: 'Answer' },
            { value: 'changes', label: 'Changes from the starter code' },
          ]}
          className="self-start"
        />
      )}
      {view === 'answer' ? (
        <CodeEditor
          aria-label={`Code answer to question ${number}`}
          language={q.language}
          value={text}
          readOnly
          minHeight="0px"
        />
      ) : (
        <pre className="max-h-[520px] overflow-auto rounded-md border border-border-subtle bg-card py-2 font-mono text-[13px] leading-relaxed">
          {lineDiff(q.starterCode, text).map((l, i) => (
            <div
              key={i}
              className={cn(
                'px-3 whitespace-pre-wrap',
                l.kind === 'added' && 'bg-tone-green-bg text-tone-green-fg',
                l.kind === 'removed' && 'bg-tone-red-bg text-tone-red-fg line-through decoration-1',
                l.kind === 'same' && 'text-fg-muted',
              )}
            >
              <span className="mr-3 inline-block w-3 select-none text-fg-subtle" aria-hidden>
                {l.kind === 'added' ? '+' : l.kind === 'removed' ? '−' : ' '}
              </span>
              <span className="sr-only">
                {l.kind === 'added' ? 'Added: ' : l.kind === 'removed' ? 'Removed: ' : ''}
              </span>
              {l.text || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

function FileAnswer({ file }: { file: NonNullable<ReviewAnswer['file']> }) {
  const href = `/api/attachments/${file.id}`;
  const image = file.contentType?.startsWith('image/');
  const pdf = file.contentType === 'application/pdf';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle px-3 py-2.5">
        <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{file.name}</span>
        <span className="text-xs text-fg-subtle">
          {file.length < 1048576
            ? `${Math.max(1, Math.round(file.length / 1024))} KB`
            : `${(file.length / 1048576).toFixed(1)} MB`}
        </span>
        <Button asChild size="sm" variant="secondary" leftIcon={<Download />}>
          <a href={href} download>
            Download
          </a>
        </Button>
      </div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${href}?inline=true`}
          alt={file.name}
          className="max-h-[480px] w-auto self-start rounded-md border border-border-subtle"
        />
      )}
      {pdf && (
        <iframe
          title={file.name}
          src={`${href}?inline=true`}
          className="h-[520px] w-full rounded-md border border-border-subtle bg-card"
        />
      )}
    </div>
  );
}

function RubricScore({
  r,
  q,
  answer,
  onSaved,
}: {
  r: Review;
  q: Question;
  answer: ReviewAnswer;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState<number | ''>(answer.reviewerPoints ?? '');
  const [note, setNote] = useState(answer.reviewerNote ?? '');
  const [saving, setSaving] = useState(false);
  const save = async (next: number | '', nextNote = note) => {
    setSaving(true);
    try {
      await api.put(`/api/assessment-invites/${r.id}/scores`, {
        questionId: q.id,
        points: next === '' ? null : next,
        note: nextNote.trim() || null,
      });
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const half = Math.round(q.points / 2);
  return (
    <div className="mt-5 rounded-lg border border-border-subtle p-4">
      <h3 className="text-sm font-semibold text-fg">How to score</h3>
      <RichText
        markdown={q.rubric}
        className="mt-1 text-sm text-fg-muted"
        empty={
          <p className="mt-1 text-sm text-fg-subtle">
            No scoring guide was written for this question.
          </p>
        }
      />
      {r.canGrade ? (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <SegmentedControl
              aria-label="Quick score"
              value={String(points)}
              onValueChange={(v) => {
                setPoints(Number(v));
                save(Number(v));
              }}
              items={[
                { value: '0', label: 'Not met' },
                ...(half > 0 && half < q.points
                  ? [{ value: String(half), label: 'Partly met' }]
                  : []),
                { value: String(q.points), label: 'Met' },
              ]}
            />
            <NumberInput
              label="Points"
              min={0}
              max={q.points}
              step={0.5}
              rightSection={<span className="pr-3 text-sm text-fg-subtle">of {q.points}</span>}
              value={points}
              onValueChange={(v) => setPoints(v === '' ? '' : Math.min(q.points, Math.max(0, v)))}
              onBlur={() => points !== (answer.reviewerPoints ?? '') && save(points)}
              className="w-36"
            />
          </div>
          <Textarea
            className="mt-3"
            label="Note for the team"
            description="Optional. Shown with the score."
            minRows={2}
            maxLength={4000}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            onBlur={() =>
              note !== (answer.reviewerNote ?? '') && points !== '' && save(points, note)
            }
          />
          <p className="mt-2 text-2xs text-fg-subtle" aria-live="polite">
            {saving
              ? 'Saving…'
              : answer.reviewerPoints !== null
                ? `Saved${answer.reviewer ? ` by ${answer.reviewer}` : ''}`
                : 'Not scored yet'}
          </p>
        </>
      ) : (
        <div className="mt-3 text-sm">
          <p className="font-medium text-fg tnum">
            {answer.reviewerPoints === null
              ? 'Not scored'
              : `Scored ${answer.reviewerPoints} of ${q.points}`}
            {answer.reviewer && (
              <span className="font-normal text-fg-subtle"> by {answer.reviewer}</span>
            )}
          </p>
          {answer.reviewerNote && (
            <p className="mt-1 whitespace-pre-wrap text-fg-muted">{answer.reviewerNote}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ExternalResult({ r, onSaved }: { r: Review; onSaved: () => void }) {
  const [percent, setPercent] = useState<number | ''>(r.percent ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (percent === '') return;
    setBusy(true);
    try {
      await api.put(`/api/assessment-invites/${r.id}/result`, { percent });
      toast.success('Score saved');
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    try {
      await api.upload(`/api/assessment-invites/${r.id}/report`, file);
      toast.success('Report added', file.name);
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <Card>
      <CardHeader
        title={`Result from ${r.assessment.providerName ?? 'the provider'}`}
        description={
          r.startedAt
            ? `They opened the test on ${formatDate(r.startedAt)}.`
            : 'They have not opened the test link yet.'
        }
      />
      <CardBody className="flex flex-col gap-5">
        {r.canRecordResult ? (
          <div className="flex flex-wrap items-end gap-3">
            <NumberInput
              label="Score"
              description="Copy it from the provider's report."
              min={0}
              max={100}
              rightSection={<span className="pr-3 text-sm text-fg-subtle">%</span>}
              value={percent}
              onValueChange={(v) =>
                setPercent(v === '' ? '' : Math.min(100, Math.max(0, Math.round(v))))
              }
              className="w-48"
            />
            <Button
              loading={busy}
              disabled={percent === '' || percent === r.percent}
              onClick={save}
            >
              Save score
            </Button>
          </div>
        ) : (
          <p className="text-3xl font-bold text-fg tnum">
            {r.percent === null ? 'No score yet' : `${r.percent}%`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {r.report ? (
            <Button asChild variant="secondary" leftIcon={<FileText />}>
              <a
                href={`/api/attachments/${r.report.id}?inline=true`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {r.report.name}
              </a>
            </Button>
          ) : (
            <span className="text-sm text-fg-subtle">No report attached.</span>
          )}
          {r.canRecordResult && (
            <FileButton
              variant="quiet"
              leftIcon={<Upload />}
              accept=".pdf,.doc,.docx"
              onFile={upload}
            >
              {r.report ? 'Replace report' : 'Attach report'}
            </FileButton>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ScoreCard({ r }: { r: Review }) {
  const used =
    r.startedAt && r.submittedAt
      ? (new Date(r.submittedAt).getTime() - new Date(r.startedAt).getTime()) / 1000
      : null;
  return (
    <Card>
      <CardHeader title="Score" />
      <CardBody className="pt-0">
        {r.percent !== null ? (
          <p className="text-3xl font-bold text-fg tnum">
            {r.percent}%
            <span className="ml-2 text-sm font-normal text-fg-subtle">
              {r.assessment.kind === 'Native' && `${r.earned} of ${plural(r.max, 'point')}`}
            </span>
          </p>
        ) : r.status === 'Submitted' ? (
          <p className="text-xl font-semibold text-fg tnum">
            {r.earned} of {plural(r.max, 'point')} so far
          </p>
        ) : (
          <p className="text-base text-fg-subtle">No score yet</p>
        )}
        {r.assessment.kind === 'Native' && (
          <p className="mt-1 text-sm text-fg-muted tnum">Pass mark {r.assessment.passMark}%</p>
        )}
        {r.pending > 0 && (
          <p className="mt-2 text-sm text-tone-amber-fg">
            {plural(r.pending, 'answer needs', 'answers need')} a score.
          </p>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          {r.submittedAt && (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Finished</dt>
              <dd className="text-right text-fg">{formatDateTime(r.submittedAt)}</dd>
            </div>
          )}
          {used !== null && r.assessment.kind === 'Native' && (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Time used</dt>
              <dd className="text-right text-fg">
                {duration(used)}
                {r.timed && ` of ${plural(r.minutes + r.extraMinutes, 'minute')}`}
              </dd>
            </div>
          )}
        </dl>
        {r.autoSubmitted && (
          <p className="mt-3 text-xs text-fg-subtle">
            Time ran out, so we submitted what they had saved.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function DecisionCard({ r, onSaved }: { r: Review; onSaved: () => void }) {
  const suggested: Decision | null =
    r.percent === null ? null : r.percent >= r.assessment.passMark ? 'Passed' : 'Failed';
  const [choice, setChoice] = useState<Decision | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const chosen = choice ?? suggested;

  if (r.decision)
    return (
      <Card>
        <CardHeader title="Decision" />
        <CardBody className="flex flex-col gap-4 pt-0">
          <Alert tone="neutral" icon={Lock} title={r.decision === 'Passed' ? 'Passed' : 'Failed'}>
            Recorded by {r.decidedBy ?? 'a reviewer'}
            {r.decidedAt ? ` on ${formatDate(r.decidedAt)}` : ''}. Scores are locked so every
            applicant is judged the same way.
          </Alert>
          {r.comment && (
            <div>
              <p className="text-xs text-fg-subtle">Comment</p>
              <p className="mt-1 text-base whitespace-pre-wrap text-fg">{r.comment}</p>
            </div>
          )}
          {r.canReopen && (
            <Button variant="secondary" onClick={() => setReopening(true)}>
              Reopen grading
            </Button>
          )}
        </CardBody>
        <Modal
          opened={reopening}
          onClose={() => setReopening(false)}
          title="Reopen grading?"
          description="The decision is cleared so scores can change. The first decision and your reason stay in the activity history."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setReopening(false)}>
                Cancel
              </Button>
              <Button
                loading={busy}
                disabled={!reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.post(`/api/assessment-invites/${r.id}/reopen`, { reason });
                    toast.success('Grading reopened');
                    setReopening(false);
                    onSaved();
                  } catch (error) {
                    toast.error((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reopen grading
              </Button>
            </>
          }
        >
          <Textarea
            label="Reason"
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </Modal>
      </Card>
    );

  if (!r.canGrade && !r.canRecordResult) return null;
  const ready = r.status === 'Submitted' && r.percent !== null;
  return (
    <Card>
      <CardHeader title="Decision" />
      <CardBody className="flex flex-col gap-4 pt-0">
        {!ready ? (
          <p className="text-sm text-fg-muted">
            {r.assessment.kind === 'External'
              ? 'Enter the score first, then record a decision.'
              : r.status === 'Submitted'
                ? 'Score every answer, then record a decision.'
                : 'You can decide once they finish.'}
          </p>
        ) : (
          <>
            <RadioGroup
              aria-label="Decision"
              orientation="horizontal"
              value={chosen}
              onValueChange={(v) => setChoice(v as Decision)}
              options={[
                { value: 'Passed', label: 'Passed' },
                { value: 'Failed', label: 'Failed' },
              ]}
            />
            {suggested && chosen !== suggested && (
              <p className="text-xs text-tone-amber-fg">
                The score suggests {suggested.toLowerCase()}. Say why in your comment.
              </p>
            )}
            <Textarea
              label="Comment"
              description="Why you decided this. The team sees it on the application."
              required
              maxLength={4000}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
            />
            <Button
              loading={busy}
              disabled={!chosen || !comment.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.post(`/api/assessment-invites/${r.id}/decision`, {
                    decision: chosen,
                    comment,
                  });
                  toast.success(`Marked as ${chosen?.toLowerCase()}`);
                  onSaved();
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Record decision
            </Button>
            <p className="text-2xs text-fg-subtle">
              Once recorded, scores lock. Only an admin can reopen them.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ChecksCard({ r, questions }: { r: Review; questions: Question[] }) {
  const summary = integritySummary(r.integrity);
  const start = r.startedAt ? new Date(r.startedAt).getTime() : 0;
  const numberOf = (id?: string | null) => {
    const i = questions.findIndex((q) => q.id === id);
    return i >= 0 ? i + 1 : null;
  };
  const meta = (e: IntegrityEvent) => {
    const into = Math.max(0, (new Date(e.at).getTime() - start) / 1000);
    const n = numberOf(e.questionId);
    return `${duration(into)} in${n ? `, question ${n}` : ''}`;
  };
  return (
    <Card>
      <CardHeader title="Checks" />
      <CardBody className="pt-0">
        {summary.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-tone-green-fg" aria-hidden />
            Nothing noted.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm text-fg">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-fg-subtle">
              Checks inform your judgment. They never fail anyone on their own.
            </p>
            <Timeline
              className="mt-4"
              items={r.integrity.slice(0, 30).map((e, i) => ({
                id: `${i}`,
                title:
                  e.type === 'returned' && e.seconds
                    ? `Came back after ${duration(e.seconds)}`
                    : (eventLabels[e.type] ?? humanize(e.type)),
                meta: meta(e),
                tone: e.type === 'returned' ? 'gray' : 'amber',
              }))}
            />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function HistoryCard({ r }: { r: Review }) {
  if (r.history.length === 0 && r.attempts.length === 0) return null;
  return (
    <Card>
      <CardHeader title="History" />
      <CardBody className="pt-0">
        {r.history.length > 0 && (
          <Timeline
            items={r.history.map((h) => {
              let reason: string | null = null;
              try {
                reason = (JSON.parse(h.details ?? '{}') as { reason?: string }).reason ?? null;
              } catch {}
              return {
                id: String(h.id),
                title: historyLabels[h.action] ?? humanize(h.action),
                meta: `${formatDateTime(h.occurredAt)}${h.actorEmail && h.actorEmail !== 'system' && !h.actorEmail.startsWith('candidate') ? ` · ${h.actorEmail}` : ''}`,
                body: reason ? <span className="text-fg-muted">Reason: {reason}</span> : undefined,
              };
            })}
          />
        )}
        {r.attempts.length > 0 && (
          <div className={cn(r.history.length > 0 && 'mt-4 border-t border-border-subtle pt-4')}>
            <p className="text-xs text-fg-subtle">Other attempts</p>
            <ul className="mt-1 space-y-1">
              {r.attempts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={resultHref(r.assessment.id, a.id)}
                    className="text-sm text-accent-foreground hover:underline"
                  >
                    Attempt {a.attempt}
                    {a.percent !== null ? ` · ${a.percent}%` : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
