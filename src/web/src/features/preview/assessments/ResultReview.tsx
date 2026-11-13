'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Lock, XCircle } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DescriptionList,
  EmptyState,
  NumberInput,
  PageHeader,
  RadioGroup,
  SegmentedControl,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { useHotkeys } from '@/lib/hooks';
import { PreviewTitle } from '../preview-ui';
import { answersFor, questionsOf, type Decision } from '../sample-assessments';
import { autoPoints, isAutoScored, questionTypeLabels, scoreSubmission } from './scoring';
import { formatWhen, useAssessments } from './store';

/** Review one submission question by question, score the open questions, record the decision. */
export function ResultReview({ id, resultId }: { id: string; resultId: string }) {
  const router = useRouter();
  const { assessments, invites, ready, updateInvite } = useAssessments();
  const [index, setIndex] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const a = assessments.find((x) => x.id === id);
  const inv = invites.find((x) => x.id === resultId && x.assessmentId === id);
  const qs = a ? questionsOf(a) : [];
  const last = Math.max(0, qs.length - 1);
  useHotkeys([
    ['arrowleft', () => setIndex((i) => Math.max(0, i - 1))],
    ['arrowright', () => setIndex((i) => Math.min(last, i + 1))],
  ]);

  const crumbs = [
    { label: 'Assessments', href: '/assessments' },
    ...(a ? [{ label: a.name, href: `/assessments/${a.id}?tab=results` }] : []),
    { label: inv?.candidate ?? 'Submission' },
  ];
  if (!ready)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title={<PreviewTitle>Submission</PreviewTitle>} />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );
  if (!a || !inv || inv.status !== 'Completed')
    return (
      <>
        <PageHeader
          breadcrumbs={crumbs}
          title={<PreviewTitle>Submission not found</PreviewTitle>}
        />
        <Card>
          <EmptyState
            icon={FileText}
            title="Nothing to review here"
            description="The candidate has not submitted, or the invitation was revoked."
            action={
              <Link
                href={a ? `/assessments/${a.id}?tab=results` : '/assessments'}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                Back to results
              </Link>
            }
          />
        </Card>
      </>
    );

  const answers = answersFor(a, inv);
  const score = scoreSubmission(qs, answers, inv.reviews);
  const locked = inv.decision !== null;
  const q = qs[Math.min(index, last)];
  const answer = q && answers[q.id];
  const suggested: Decision | null =
    score.percent === null ? null : score.percent >= a.passMark ? 'Passed' : 'Failed';
  const chosen = decision ?? suggested;
  const nextToReview = invites.find(
    (i) => i.assessmentId === id && i.status === 'Completed' && !i.decision && i.id !== inv.id,
  );
  const setReview = (qid: string, points: number | '') => {
    const reviews = { ...inv.reviews };
    if (points === '') delete reviews[qid];
    else reviews[qid] = points;
    updateInvite(inv.id, { reviews });
  };
  const stateOf = (qq: (typeof qs)[number]) =>
    isAutoScored(qq)
      ? autoPoints(qq, answers[qq.id]) === qq.points
        ? 'right'
        : 'wrong'
      : inv.reviews[qq.id] === undefined
        ? 'todo'
        : 'scored';

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <PreviewTitle>
            {inv.candidate}
            <StatusBadge status={inv.decision ?? 'Review'} />
          </PreviewTitle>
        }
        description={`${a.name} · submitted ${formatWhen(inv.submittedOn)}`}
        actions={
          nextToReview && (
            <Button
              variant="secondary"
              rightIcon={<ChevronRight />}
              onClick={() => {
                setIndex(0);
                setDecision(null);
                router.push(`/assessments/${a.id}/results/${nextToReview.id}`);
              }}
            >
              Next to review
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 self-start">
          <nav aria-label="Questions" className="border-b border-border-subtle px-5 py-4">
            <ol className="flex flex-wrap gap-1.5">
              {qs.map((qq, i) => {
                const st = stateOf(qq);
                return (
                  <li key={qq.id}>
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-current={i === index ? 'step' : undefined}
                      aria-label={`Question ${i + 1}, ${
                        st === 'right'
                          ? 'correct'
                          : st === 'wrong'
                            ? 'incorrect'
                            : st === 'todo'
                              ? 'needs a score'
                              : 'scored'
                      }`}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-md border text-sm font-medium tnum transition-colors',
                        st === 'right' && 'border-transparent bg-tone-green-bg text-tone-green-fg',
                        st === 'wrong' && 'border-transparent bg-tone-red-bg text-tone-red-fg',
                        st === 'todo' && 'border-dashed border-tone-amber-dot text-tone-amber-fg',
                        st === 'scored' && 'border-transparent bg-tone-blue-bg text-tone-blue-fg',
                        i === index && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                      )}
                    >
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-2xs text-fg-subtle">Use ← and → to move between questions.</p>
          </nav>

          {q && (
            <div className="px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-subtle tnum">
                  Question {index + 1} of {qs.length}
                </span>
                <Badge size="sm">{questionTypeLabels[q.type]}</Badge>
                <Badge size="sm" tone="blue">
                  {q.points} pts
                </Badge>
              </div>
              <p className="mt-2 text-md text-fg">{q.prompt}</p>

              <h3 className="mt-5 mb-2 text-sm font-semibold text-fg">Candidate’s answer</h3>
              {isAutoScored(q) ? (
                <ul className="flex flex-col gap-1.5">
                  {q.options.map((o) => {
                    const picked = answer.choice.includes(o.id);
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                          picked ? 'border-primary bg-accent' : 'border-border-subtle',
                        )}
                      >
                        <span className="flex-1 text-fg">{o.text}</span>
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
              ) : q.type === 'code' ? (
                <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-fg">
                  {answer.text || '// no answer'}
                </pre>
              ) : q.type === 'file' ? (
                <p className="inline-flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm text-fg">
                  <FileText className="size-4 text-fg-subtle" aria-hidden />
                  {answer.file}
                  <span className="text-2xs text-fg-subtle">(sample file, not downloadable)</span>
                </p>
              ) : (
                <p className="rounded-md bg-muted p-3 text-base whitespace-pre-wrap text-fg">
                  {answer.text || 'No answer'}
                </p>
              )}

              {isAutoScored(q) ? (
                <p
                  className={cn(
                    'mt-4 inline-flex items-center gap-1.5 text-sm font-medium',
                    stateOf(q) === 'right' ? 'text-tone-green-fg' : 'text-tone-red-fg',
                  )}
                >
                  {stateOf(q) === 'right' ? (
                    <CheckCircle2 className="size-4" aria-hidden />
                  ) : (
                    <XCircle className="size-4" aria-hidden />
                  )}
                  Scored automatically: {autoPoints(q, answer)} of {q.points}
                </p>
              ) : (
                <div className="mt-5 rounded-lg border border-border-subtle p-4">
                  <h3 className="text-sm font-semibold text-fg">Rubric</h3>
                  <p className="mt-1 text-sm text-fg-muted">
                    {q.rubric || 'No rubric was written for this question.'}
                  </p>
                  {locked ? (
                    <p className="mt-3 text-sm font-medium text-fg tnum">
                      Scored {inv.reviews[q.id] ?? 0} of {q.points}
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <SegmentedControl
                        aria-label="Rubric level"
                        value={String(inv.reviews[q.id] ?? '')}
                        onValueChange={(v) => setReview(q.id, Number(v))}
                        items={[
                          { value: '0', label: 'Not met' },
                          { value: String(Math.round(q.points / 2)), label: 'Partly met' },
                          { value: String(q.points), label: 'Met' },
                        ]}
                      />
                      <NumberInput
                        label={`Points (0–${q.points})`}
                        min={0}
                        max={q.points}
                        value={inv.reviews[q.id] ?? ''}
                        onValueChange={(v) =>
                          setReview(q.id, v === '' ? '' : Math.min(q.points, Math.max(0, v)))
                        }
                        className="w-36"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-between gap-2">
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
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Score" />
            <div className="px-5 pb-5">
              <p className="text-3xl font-bold text-fg tnum">
                {score.percent ?? '—'}
                <span className="text-base font-normal text-fg-subtle"> / 100</span>
              </p>
              <p className="mt-1 text-sm text-fg-muted tnum">
                {score.earned} of {score.total} points · pass mark {a.passMark}%
              </p>
              {score.pending > 0 && (
                <p className="mt-2 text-sm text-tone-amber-fg">
                  {score.pending} {score.pending === 1 ? 'question needs' : 'questions need'} a
                  score.
                </p>
              )}
              <DescriptionList
                className="mt-4"
                items={[
                  { label: 'Email', value: inv.email },
                  { label: 'Invited', value: formatWhen(inv.invitedOn) },
                  { label: 'Submitted', value: formatWhen(inv.submittedOn) },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Decision" />
            <div className="flex flex-col gap-4 px-5 pb-5">
              {locked ? (
                <>
                  <Alert tone="neutral" icon={Lock} title={`${inv.decision} · locked`}>
                    Recorded by {inv.reviewer ?? 'a reviewer'}. Decisions stay locked so results
                    remain comparable.
                  </Alert>
                  {inv.comment && (
                    <div>
                      <p className="text-xs text-fg-subtle">Reviewer comment</p>
                      <p className="mt-1 text-base whitespace-pre-wrap text-fg">{inv.comment}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Textarea
                    label="Reviewer comment"
                    description="Why this result. Required."
                    value={inv.comment}
                    onChange={(e) => updateInvite(inv.id, { comment: e.currentTarget.value })}
                  />
                  <RadioGroup
                    aria-label="Final decision"
                    orientation="horizontal"
                    value={chosen}
                    onValueChange={(v) => setDecision(v as Decision)}
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
                  <Button
                    disabled={score.pending > 0 || !chosen || !inv.comment.trim()}
                    onClick={() => {
                      updateInvite(inv.id, { decision: chosen, reviewer: 'You' });
                      toast.success(`Marked as ${chosen?.toLowerCase()}`, inv.candidate);
                    }}
                  >
                    Submit decision
                  </Button>
                  {(score.pending > 0 || !inv.comment.trim()) && (
                    <p className="text-xs text-fg-subtle">
                      {score.pending > 0
                        ? 'Score every open question first.'
                        : 'Add a comment to submit.'}
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
