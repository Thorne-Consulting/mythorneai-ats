'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CalendarPlus, ClipboardCheck, Lock } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { RecommendationBadge } from '@/components/status';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CellStack,
  Collapse,
  EmptyState,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { LoadError, useApplication, useInvalidateApplication } from './application-data';
import type { Interview } from './application-types';
import { ScorecardFields, useScorecardForm } from './ScorecardModal';
import { criterionAverage, oneDecimal, weightedScore } from './scorecard-math';

const noop = () => () => {};
const nameOf = (email: string) => email.split('@')[0];

/**
 * The Scorecards tab. Your own scorecard for each interview you are on comes first; below it, the
 * panel's submitted scorecards side by side per criterion. The API already withholds other people's
 * scorecards from an assigned interviewer until they submit theirs, so this page only shows what it
 * is given and says what is hidden.
 */
export function ApplicationScorecards({ id, focus }: { id: string; focus?: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  // Drafts live in localStorage, which the server render cannot see; render the forms on the
  // client only so a restored draft does not mismatch the server HTML.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  // "Write feedback" links land here with ?interview=; bring that form into view once.
  useEffect(() => {
    if (focus && query.data)
      document.getElementById(`interview-${focus}`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, hydrated, Boolean(query.data)]);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  const application = query.data.application;
  const interviews = application.interviews
    .filter((item) => item.status !== 'Cancelled')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const owed = interviews.filter(
    (item) =>
      item.interviewerEmails.includes(user.email) &&
      !item.scorecards.some((card) => card.interviewerEmail === user.email),
  );
  const panel = interviews.filter((item) => item.submittedScorecards > 0);

  if (interviews.length === 0)
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title="No interviews yet"
          description="Scorecards are written after each interview. Schedule one to start."
          action={
            <Button asChild variant="secondary">
              <Link href={`/applications/${id}/interviews`}>Go to interviews</Link>
            </Button>
          }
        />
      </Card>
    );

  return (
    <div className="space-y-5">
      {!hydrated && owed.length > 0 && (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      )}
      {hydrated &&
        owed.map((interview) => (
          <OwedScorecard
            key={interview.id}
            applicationId={id}
            interview={interview}
            onSubmitted={invalidate}
          />
        ))}

      {panel.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title="No scorecards submitted yet"
            description={
              owed.length
                ? 'Yours will be the first. The comparison appears here once the panel submits.'
                : 'The comparison appears here once the panel submits their scorecards.'
            }
          />
        </Card>
      ) : (
        panel.map((interview) =>
          interview.scorecardsVisible ? (
            <PanelComparison key={interview.id} interview={interview} />
          ) : (
            <Card key={interview.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <Lock className="size-4 text-fg-subtle" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-fg-muted">
                <span className="font-medium text-fg">{interview.title}</span>:{' '}
                {interview.submittedScorecards} of {interview.interviewerEmails.length} submitted.
                Hidden until you submit yours, so nobody anchors on anyone else.
              </p>
            </Card>
          ),
        )
      )}
    </div>
  );
}

function OwedScorecard({
  applicationId,
  interview,
  onSubmitted,
}: {
  applicationId: string;
  interview: Interview;
  onSubmitted: () => void;
}) {
  const form = useScorecardForm({
    interviewId: interview.id,
    criteria: interview.criteria,
    onSubmitted,
  });
  const upcoming = new Date(interview.startsAt) > new Date();
  return (
    <Card id={`interview-${interview.id}`} className="scroll-mt-24">
      <CardHeader
        title={`Your scorecard: ${interview.title}`}
        description={`${formatDateTime(interview.startsAt)}${interview.interviewKitName ? ` · ${interview.interviewKitName}` : ''}${upcoming ? ' · not started yet' : ''}`}
        action={
          <Button asChild variant="link" size="sm">
            <Link href={`/interviews/${interview.id}?application=${applicationId}`}>
              Open prep page
            </Link>
          </Button>
        }
      />
      <CardBody>
        <ScorecardFields form={form} />
      </CardBody>
      <CardFooter className="justify-end">
        <Button
          disabled={!form.canSubmit}
          loading={form.mutation.isPending}
          onClick={() => form.mutation.mutate()}
        >
          Submit and lock
        </Button>
      </CardFooter>
    </Card>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-fg-subtle">–</span>;
  return (
    <span className="font-semibold tnum">
      {Number.isInteger(value) ? value : oneDecimal(value)}
    </span>
  );
}

/** Everyone's submitted scorecards for one interview: criteria down, interviewers across. */
function PanelComparison({ interview }: { interview: Interview }) {
  const [open, setOpen] = useState(false);
  const cards = interview.scorecards;
  const criteria = interview.criteria;
  const totals = cards.map((card) => weightedScore(card, criteria));
  const meanTotal = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  const average = (pick: (card: Interview['scorecards'][number]) => number) =>
    cards.reduce((sum, card) => sum + pick(card), 0) / (cards.length || 1);
  return (
    <Card id={`interview-${interview.id}`} className="scroll-mt-24">
      <CardHeader
        title={interview.title}
        description={`${formatDate(interview.startsAt)} · ${cards.length} of ${interview.interviewerEmails.length} scorecards submitted`}
      />
      <Table>
        <THead>
          <TR>
            <TH>Criterion</TH>
            {cards.map((card) => (
              <TH key={card.id} align="center" title={card.interviewerEmail}>
                {nameOf(card.interviewerEmail)}
              </TH>
            ))}
            {cards.length > 1 && <TH align="center">Average</TH>}
          </TR>
        </THead>
        <TBody>
          {criteria.map((criterion) => (
            <TR key={criterion.id}>
              <TD className="min-w-48">
                <CellStack primary={criterion.name} secondary={`weight ${criterion.weight}`} />
              </TD>
              {cards.map((card) => (
                <TD key={card.id} align="center">
                  <Score
                    value={
                      card.criteria.find((item) => item.criterionId === criterion.id)?.rating ??
                      null
                    }
                  />
                </TD>
              ))}
              {cards.length > 1 && (
                <TD align="center" className="bg-muted/50">
                  <Score value={criterionAverage(cards, criterion.id)} />
                </TD>
              )}
            </TR>
          ))}
          <TR>
            <TD className="font-semibold">{criteria.length ? 'Weighted total' : 'Score'}</TD>
            {totals.map((total, index) => (
              <TD key={cards[index].id} align="center" className="text-md">
                <Score value={total} />
              </TD>
            ))}
            {cards.length > 1 && (
              <TD align="center" className="bg-muted/50 text-md">
                <Score value={meanTotal} />
              </TD>
            )}
          </TR>
          <TR>
            <TD>Overall rating</TD>
            {cards.map((card) => (
              <TD key={card.id} align="center">
                <Score value={card.rating} />
              </TD>
            ))}
            {cards.length > 1 && (
              <TD align="center" className="bg-muted/50">
                <Score value={average((card) => card.rating)} />
              </TD>
            )}
          </TR>
          <TR>
            <TD>Recommendation</TD>
            {cards.map((card) => (
              <TD key={card.id} align="center">
                <RecommendationBadge recommendation={card.recommendation} />
              </TD>
            ))}
            {cards.length > 1 && <TD className="bg-muted/50" />}
          </TR>
        </TBody>
      </Table>
      <CardFooter>
        <Button variant="link" size="sm" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
          {open ? 'Hide written feedback' : 'Read written feedback'}
        </Button>
      </CardFooter>
      <Collapse open={open}>
        <div className="space-y-3 px-5 pb-5">
          {cards.map((card) => (
            <article key={card.id} className="rounded-lg border border-border-subtle p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={card.interviewerEmail} size="sm" />
                <p className="min-w-0 truncate text-sm font-semibold text-fg">
                  {card.interviewerEmail}
                </p>
                <span className="ml-auto text-xs text-fg-subtle">
                  {formatDateTime(card.submittedAt)}
                </span>
              </div>
              <p className="mt-3 text-base text-fg">{card.evidence}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <p className="text-sm text-fg-muted">
                  <span className="font-semibold text-fg">Strengths:</span> {card.strengths}
                </p>
                <p className="text-sm text-fg-muted">
                  <span className="font-semibold text-fg">Concerns:</span> {card.concerns}
                </p>
              </div>
              {card.criteria.length > 0 && (
                <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                  {card.criteria.map((item) => (
                    <li key={item.criterionId} className="py-2.5">
                      <p className="text-sm font-semibold text-fg">
                        {item.criterionName}{' '}
                        <span className="font-normal text-fg-subtle tnum">· {item.rating}/5</span>
                      </p>
                      <p className="text-sm text-fg-muted">{item.evidence}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </Collapse>
    </Card>
  );
}
