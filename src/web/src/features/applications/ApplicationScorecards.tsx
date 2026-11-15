'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BellRing,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Lock,
  Sparkles,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { RecommendationBadge } from '@/components/status';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  Select,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { AssessmentResultsCard } from '@/features/assessments/AssessmentResultsCard';
import {
  reasonOptions,
  useRejectionReasons,
} from '@/features/rejection-reasons/rejection-reasons-data';
import { AiSummary } from './AiSummary';
import { LoadError, useApplication, useInvalidateApplication } from './application-data';
import { CompareButton } from './CompareApplicants';
import { nameFor, type ApplicationData, type Interview, type Scorecard } from './application-types';
import { CloseOutChoices, useCloseOut } from './RejectModal';
import { ScorecardForm } from './ScorecardForm';
import {
  competencyGrid,
  criterionAverage,
  oneDecimal,
  scoreTone,
  tallyText,
  weightedScore,
} from './scorecard-math';

const hasStarted = (interview: Interview) => new Date(interview.startsAt).getTime() <= Date.now();
const missingFrom = (interview: Interview) =>
  interview.interviewerEmails.filter(
    (email) => !interview.scorecards.some((card) => card.interviewerEmail === email),
  );

/**
 * The Feedback tab. Your own scorecards come first. Everyone else's stay hidden until you submit
 * yours (the API enforces it). Then the panel: a tally, every competency side by side, each
 * interview's scorecards, and the team's decision.
 */
export function ApplicationScorecards({ id, focus }: { id: string; focus?: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [onBehalf, setOnBehalf] = useState<{ interviewId: string; email: string } | null>(null);

  // "Write scorecard" links land here with ?interview=, and Overview links with #decision.
  useEffect(() => {
    if (!query.data) return;
    const target = focus ? `interview-${focus}` : window.location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, Boolean(query.data)]);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  const data = query.data;
  const application = data.application;
  const interviews = application.interviews
    .filter((item) => !['Cancelled', 'Proposed'].includes(item.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const owed = interviews.filter(
    (item) =>
      item.interviewerEmails.includes(user.email) &&
      !item.scorecards.some((card) => card.interviewerEmail === user.email),
  );
  const panel = interviews.filter((item) => item.submittedScorecards > 0 || hasStarted(item));

  if (interviews.length === 0)
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title="No interviews yet"
          description="Scorecards are written after each interview. Schedule one from the Interviews tab."
          action={
            <Button asChild variant="secondary">
              <Link href={`/applications/${id}/interviews`}>Go to interviews</Link>
            </Button>
          }
        />
      </Card>
    );

  const onBehalfInterview = onBehalf && interviews.find((item) => item.id === onBehalf.interviewId);

  return (
    <div className="space-y-5">
      {data.blinded && (
        <Alert
          tone="info"
          icon={Lock}
          title={`Submit your scorecard for ${data.blindedBy[0]} to see the panel's feedback.`}
        >
          Until then, nobody else's scores or notes show here, so yours stay your own.
        </Alert>
      )}

      <AssessmentResultsCard applicationId={id} />

      {owed.map((interview) =>
        hasStarted(interview) ? (
          <ScorecardForm
            key={interview.id}
            applicationId={id}
            interview={interview}
            onDone={invalidate}
          />
        ) : (
          <Card
            key={interview.id}
            id={`interview-${interview.id}`}
            className="flex scroll-mt-24 flex-wrap items-center gap-3 px-5 py-4"
          >
            <CalendarClock className="size-5 shrink-0 text-fg-subtle" aria-hidden />
            <p className="min-w-0 flex-1 text-base text-fg-muted">
              <span className="font-medium text-fg">Your scorecard for {interview.title}</span>{' '}
              opens when the interview starts, {formatDateTime(interview.startsAt)}.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/interviews/${interview.id}?application=${id}`}>
                Open interview prep
              </Link>
            </Button>
          </Card>
        ),
      )}

      {onBehalfInterview && onBehalf && (
        <ScorecardForm
          key={`${onBehalf.interviewId}-${onBehalf.email}`}
          applicationId={id}
          interview={onBehalfInterview}
          onBehalfOf={{ email: onBehalf.email, name: nameFor(data.people, onBehalf.email) }}
          onDone={() => {
            setOnBehalf(null);
            invalidate();
          }}
        />
      )}

      {!data.blinded && (
        <>
          <PanelSummary
            id={id}
            data={data}
            interviews={panel}
            onEnterFor={(interviewId, email) => setOnBehalf({ interviewId, email })}
          />
          {panel.filter((item) => item.scorecards.length > 0).length > 1 && (
            <CompetencyGrid interviews={panel.filter((item) => item.scorecards.length > 0)} />
          )}
          {panel
            .filter((item) => item.scorecards.length > 0)
            .map((interview) => (
              <PanelComparison
                key={interview.id}
                applicationId={id}
                interview={interview}
                people={data.people}
                me={user.email}
              />
            ))}
        </>
      )}

      <Decision id={id} data={data} />
    </div>
  );
}

/** Where the panel stands: the calls so far, who is missing, and an AI read across everything. */
function PanelSummary({
  id,
  data,
  interviews,
  onEnterFor,
}: {
  id: string;
  data: ApplicationData;
  interviews: Interview[];
  onEnterFor: (interviewId: string, email: string) => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const cards = interviews.flatMap((item) => item.scorecards);
  const started = interviews.filter(hasStarted);
  const expected = started.reduce((sum, item) => sum + item.interviewerEmails.length, 0);
  const waiting = started.flatMap((interview) =>
    missingFrom(interview).map((email) => ({ interview, email })),
  );
  const summarize = useMutation({
    mutationFn: () =>
      api.post<{ summary: string }>('/api/ai/summarize-application', { applicationId: id }),
    onSuccess: (result) => setSummary(result.summary),
    onError: (error: Error) => toast.error('Could not summarize the feedback', error.message),
  });
  const remind = useMutation({
    mutationFn: (input: { interviewId: string; email: string }) =>
      api.post<{ reminded: string[] }>(`/api/interviews/${input.interviewId}/remind`, {
        email: input.email,
      }),
    onSuccess: (_, input) => toast.success(`Reminded ${nameFor(data.people, input.email)}`),
    onError: (error: Error) => toast.error('Could not send the reminder', error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Panel feedback"
        description={
          cards.length
            ? `${cards.length} of ${Math.max(expected, cards.length)} scorecards in`
            : 'Scorecards show here as interviewers submit them.'
        }
        action={
          cards.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CompareButton applicationId={id} />
              {data.canManage && (
                <Button
                  variant="soft"
                  size="sm"
                  leftIcon={<Sparkles />}
                  loading={summarize.isPending}
                  onClick={() => summarize.mutate()}
                >
                  Summarize all feedback
                </Button>
              )}
            </div>
          )
        }
      />
      <CardBody className="space-y-4">
        {cards.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardCheck}
            title="No scorecards yet"
            description={
              started.length
                ? 'Interviewers are reminded automatically. You can nudge them below.'
                : 'Scorecards open when each interview starts.'
            }
          />
        ) : (
          <p className="text-md font-semibold text-fg">
            {tallyText(cards.map((card) => card.recommendation))}
          </p>
        )}
        {waiting.length > 0 && (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {waiting.map(({ interview, email }) => (
              <li
                key={`${interview.id}-${email}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
              >
                <Avatar name={nameFor(data.people, email)} size="sm" />
                <p className="min-w-0 flex-1 basis-52 text-sm text-fg-muted">
                  Waiting on{' '}
                  <span className="font-medium text-fg">{nameFor(data.people, email)}</span> for{' '}
                  {interview.title}
                </p>
                {data.canManage && (
                  <div className="ml-auto flex gap-1.5">
                    <Button
                      size="xs"
                      variant="secondary"
                      leftIcon={<BellRing />}
                      loading={
                        remind.isPending &&
                        remind.variables?.email === email &&
                        remind.variables.interviewId === interview.id
                      }
                      onClick={() => remind.mutate({ interviewId: interview.id, email })}
                    >
                      Remind
                    </Button>
                    <Button
                      size="xs"
                      variant="quiet"
                      onClick={() => onEnterFor(interview.id, email)}
                    >
                      Enter their feedback
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {summary && <AiSummary text={summary} />}
      </CardBody>
    </Card>
  );
}

const toneCell = {
  red: 'bg-tone-red-bg text-tone-red-fg',
  amber: 'bg-tone-amber-bg text-tone-amber-fg',
  green: 'bg-tone-green-bg text-tone-green-fg',
} as const;

export function ScoreChip({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-fg-subtle">–</span>;
  return (
    <span
      className={cn(
        'inline-flex min-w-9 items-center justify-center rounded-md px-1.5 py-0.5 text-sm font-semibold tnum',
        toneCell[scoreTone(value)],
        className,
      )}
    >
      {Number.isInteger(value) ? value : oneDecimal(value)}
    </span>
  );
}

/** Every competency against every interview, so a weak spot shows up across the loop. */
function CompetencyGrid({ interviews }: { interviews: Interview[] }) {
  const rows = competencyGrid(interviews);
  if (rows.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Across all interviews"
        description="The panel's average for each competency."
      />
      <Table>
        <THead>
          <TR>
            <TH>Competency</TH>
            {interviews.map((interview) => (
              <TH key={interview.id} align="center">
                {interview.title}
              </TH>
            ))}
            <TH align="center">Overall</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.name}>
              <TD className="min-w-44 font-medium text-fg">{row.name}</TD>
              {row.cells.map((cell, index) => (
                <TD key={interviews[index].id} align="center">
                  <ScoreChip value={cell} />
                </TD>
              ))}
              <TD align="center" className="bg-muted/50">
                <ScoreChip value={row.average} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

/** Everyone's scorecards for one interview: competencies down, interviewers across. */
function PanelComparison({
  applicationId,
  interview,
  people,
  me,
}: {
  applicationId: string;
  interview: Interview;
  people: Record<string, string>;
  me: string;
}) {
  const cards = interview.scorecards;
  const criteria = interview.criteria;
  const totals = cards.map((card) => weightedScore(card, criteria));
  const meanTotal = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  const missing = missingFrom(interview);
  const evidenceOf = (card: Scorecard, criterionId: string) =>
    card.criteria.find((item) => item.criterionId === criterionId);

  return (
    <Card id={`interview-${interview.id}`} className="scroll-mt-24 overflow-hidden">
      <CardHeader
        title={interview.title}
        description={`${formatDate(interview.startsAt)} · ${cards.length} of ${interview.interviewerEmails.length} scorecards in${missing.length ? ` · waiting on ${missing.map((email) => nameFor(people, email)).join(', ')}` : ''}`}
      />
      {criteria.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Competency</TH>
              {cards.map((card) => (
                <TH key={card.id} align="center" title={card.interviewerEmail}>
                  {nameFor(people, card.interviewerEmail)}
                </TH>
              ))}
              {cards.length > 1 && <TH align="center">Average</TH>}
            </TR>
          </THead>
          <TBody>
            {criteria.map((criterion) => (
              <TR key={criterion.id}>
                <TD className="min-w-44">
                  <span className="font-medium text-fg">{criterion.name}</span>
                  <span className="block text-xs text-fg-subtle">Weight {criterion.weight}</span>
                </TD>
                {cards.map((card) => {
                  const rated = evidenceOf(card, criterion.id);
                  return (
                    <TD key={card.id} align="center">
                      {rated ? (
                        <Popover>
                          <PopoverTrigger
                            className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={`${nameFor(people, card.interviewerEmail)} on ${criterion.name}: ${rated.rating} of 5. Show notes`}
                          >
                            <ScoreChip value={rated.rating} className="cursor-pointer" />
                          </PopoverTrigger>
                          <PopoverContent>
                            <p className="text-xs font-medium text-fg-subtle">
                              {nameFor(people, card.interviewerEmail)} on {criterion.name}
                            </p>
                            <p className="mt-1 text-sm text-fg">
                              {rated.evidence || 'No notes for this one.'}
                            </p>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <ScoreChip value={null} />
                      )}
                    </TD>
                  );
                })}
                {cards.length > 1 && (
                  <TD align="center" className="bg-muted/50">
                    <ScoreChip value={criterionAverage(cards, criterion.id)} />
                  </TD>
                )}
              </TR>
            ))}
            <TR>
              <TD className="font-semibold text-fg">Weighted score</TD>
              {totals.map((total, index) => (
                <TD key={cards[index].id} align="center">
                  <ScoreChip value={total} />
                </TD>
              ))}
              {cards.length > 1 && (
                <TD align="center" className="bg-muted/50">
                  <ScoreChip value={meanTotal} />
                </TD>
              )}
            </TR>
          </TBody>
        </Table>
      )}
      <div className="grid gap-4 border-t border-border-subtle p-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className="min-w-0 space-y-3 rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2.5">
              <Avatar name={nameFor(people, card.interviewerEmail)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {nameFor(people, card.interviewerEmail)}
                </p>
                <p className="text-xs text-fg-subtle">
                  {formatDateTime(card.submittedAt)}
                  {card.submittedBy ? ` · entered by ${nameFor(people, card.submittedBy)}` : ''}
                </p>
              </div>
              <RecommendationBadge recommendation={card.recommendation} />
            </div>
            <p className="text-base text-fg">{card.evidence}</p>
            {card.strengths && (
              <p className="text-sm text-fg-muted">
                <span className="font-semibold text-fg">Strengths: </span>
                {card.strengths}
              </p>
            )}
            {card.concerns && (
              <p className="text-sm text-fg-muted">
                <span className="font-semibold text-fg">Concerns: </span>
                {card.concerns}
              </p>
            )}
            <Corrections
              applicationId={applicationId}
              card={card}
              people={people}
              canAdd={card.interviewerEmail === me || card.submittedBy === me}
            />
          </article>
        ))}
      </div>
    </Card>
  );
}

const CHOICES = [
  { value: 'Advance', label: 'Move forward' },
  { value: 'Offer', label: 'Make an offer' },
  { value: 'Reject', label: 'Reject' },
];

/** The team's call after the interviews, saved with who made it and why. */
function Decision({ id, data }: { id: string; data: ApplicationData }) {
  const router = useRouter();
  const invalidate = useInvalidateApplication(id);
  const application = data.application;
  const stages = [...application.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const current = stages.findIndex((stage) => stage.id === application.stageId);
  const forward = stages.filter(
    (stage, index) => index > current && !(stage.isTerminal && /hired/i.test(stage.name)),
  );
  const [choice, setChoice] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(forward[0]?.id ?? null);
  const [reason, setReason] = useState<string | null>(null);
  const reasons = useRejectionReasons();
  const [rationale, setRationale] = useState('');
  const closeOut = useCloseOut(id, choice === 'Reject');
  const record = useMutation({
    mutationFn: () =>
      api.post(`/api/applications/${id}/decision`, {
        decision: choice,
        rationale,
        stageId: choice === 'Advance' ? stageId : null,
        reason: choice === 'Reject' ? reason : null,
        ...(choice === 'Reject' ? closeOut.choices : {}),
      }),
    onSuccess: () => {
      invalidate();
      setChoice(null);
      setRationale('');
      closeOut.reset();
      toast.success('Decision recorded');
      if (choice === 'Offer') router.push(`/applications/${id}/offer`);
    },
    onError: (error: Error) => toast.error('Could not record the decision', error.message),
  });
  const decided = application.decisions;
  // Someone who has not seen the panel's feedback yet should not be the one to decide.
  const canDecide = data.canManage && application.status === 'Active' && !data.blinded;
  if (!canDecide && decided.length === 0) return null;
  const ready =
    choice &&
    rationale.trim() &&
    (choice !== 'Advance' || stageId) &&
    (choice !== 'Reject' || reason);
  const stageName = (stage?: string | null) => stages.find((s) => s.id === stage)?.name;

  return (
    <Card id="decision" className="scroll-mt-24">
      <CardHeader
        title="Decision"
        description={
          canDecide ? 'Record what the team decided and why. It shows in Activity.' : undefined
        }
      />
      <CardBody className="space-y-5">
        {decided.length > 0 && (
          <ul className="space-y-3">
            {decided.map((item) => (
              <li key={item.id} className="rounded-lg bg-muted p-4">
                <p className="text-sm text-fg">
                  <span className="font-semibold">{nameFor(data.people, item.decidedBy)}</span>{' '}
                  {item.decision === 'Advance'
                    ? `moved them forward to ${stageName(item.toStageId) ?? 'the next stage'}`
                    : item.decision === 'Offer'
                      ? 'decided to make an offer'
                      : 'decided to reject'}
                  <span className="text-fg-subtle"> · {formatDateTime(item.decidedAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{item.rationale}</p>
              </li>
            ))}
          </ul>
        )}
        {canDecide && (
          <div className="space-y-4">
            <RadioGroup
              aria-label="Decision"
              orientation="horizontal"
              value={choice}
              onValueChange={setChoice}
              options={CHOICES.filter((item) => item.value !== 'Advance' || forward.length > 0)}
            />
            {choice === 'Advance' && (
              <Select
                label="Move to"
                value={stageId}
                onChange={setStageId}
                data={forward.map((stage) => ({ value: stage.id, label: stage.name }))}
                className="max-w-xs"
              />
            )}
            {choice === 'Reject' && (
              <Select
                label="Reason"
                description={
                  application.candidateDoNotContact
                    ? 'They asked not to be contacted, so no email is sent.'
                    : 'They get the standard rejection email.'
                }
                placeholder="Choose a reason"
                value={reason}
                onChange={setReason}
                data={reasonOptions(reasons.data ?? [], ['Rejected'])}
                className="max-w-md"
              />
            )}
            {choice === 'Reject' && reason && (
              <CloseOutChoices
                closeOut={closeOut}
                firstName={application.candidateName.split(' ')[0]}
              />
            )}
            {choice && (
              <Textarea
                label="Why"
                required
                description="One or two sentences the team can read later."
                minRows={3}
                value={rationale}
                onChange={(event) => setRationale(event.currentTarget.value)}
              />
            )}
            {choice && (
              <div className="flex justify-end">
                <Button
                  variant={choice === 'Reject' ? 'danger' : 'primary'}
                  disabled={!ready}
                  loading={record.isPending}
                  onClick={() => record.mutate()}
                >
                  {choice === 'Reject'
                    ? 'Reject and record'
                    : choice === 'Offer'
                      ? 'Record and start the offer'
                      : 'Move forward and record'}
                </Button>
              </div>
            )}
          </div>
        )}
        {!canDecide && decided.length > 0 && (
          <Badge tone="gray">This application is {application.status.toLowerCase()}.</Badge>
        )}
      </CardBody>
    </Card>
  );
}

/** Dated corrections under a locked scorecard. Only its author can add one. */
function Corrections({
  applicationId,
  card,
  people,
  canAdd,
}: {
  applicationId: string;
  card: Scorecard;
  people: Record<string, string>;
  canAdd: boolean;
}) {
  const invalidate = useInvalidateApplication(applicationId);
  const [body, setBody] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.post(`/api/scorecards/${card.id}/addenda`, { body }),
    onSuccess: () => {
      setBody(null);
      invalidate();
      toast.success('Correction added');
    },
    onError: (error: Error) => toast.error('Could not add the correction', error.message),
  });
  const { data } = useApplication(applicationId);
  const addenda = data?.addenda?.[card.id] ?? [];
  if (addenda.length === 0 && !canAdd) return null;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      {addenda.map((item) => (
        <p key={item.id} className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">
            Correction, {formatDateTime(item.createdAt)}
            {item.authorEmail !== card.interviewerEmail
              ? ` by ${nameFor(people, item.authorEmail)}`
              : ''}
            :{' '}
          </span>
          {item.body}
        </p>
      ))}
      {canAdd &&
        (body === null ? (
          <Button variant="link" size="sm" onClick={() => setBody('')}>
            Add a correction
          </Button>
        ) : (
          <div className="space-y-2">
            <Textarea
              label="Correction"
              description="Your scorecard stays as you sent it. This is added below it with today's date."
              minRows={2}
              autoFocus
              value={body}
              onChange={(event) => setBody(event.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setBody(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!body.trim()}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Add correction
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
