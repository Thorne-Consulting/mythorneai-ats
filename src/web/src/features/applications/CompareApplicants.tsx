'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Columns3, Lock, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { StatusBadge } from '@/components/status';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  SkeletonRows,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ScoreChip } from './ApplicationScorecards';
import { LoadError } from './application-data';
import { RECOMMENDATIONS, oneDecimal } from './scorecard-math';

type Peer = { id: string; name: string; stage: string; scorecards: number };

const MAX_OTHERS = 3;

/** Opens a picker of other applicants on the same job, then the side-by-side comparison. */
export function CompareButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const peers = useQuery({
    queryKey: ['application-peers', applicationId],
    queryFn: () => api.get<Peer[]>(`/api/applications/${applicationId}/peers`),
    enabled: open,
  });
  const toggle = (id: string, on: boolean) =>
    setPicked((current) => (on ? [...current, id] : current.filter((item) => item !== id)));

  return (
    <>
      <Button variant="secondary" size="sm" leftIcon={<Columns3 />} onClick={() => setOpen(true)}>
        Compare
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Compare with other applicants"
        description={`Pick up to ${MAX_OTHERS} people on this job to see side by side.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={picked.length === 0}
              onClick={() =>
                router.push(`/applications/compare?ids=${[applicationId, ...picked].join(',')}`)
              }
            >
              Compare {picked.length + 1} applicants
            </Button>
          </>
        }
      >
        {peers.isPending ? (
          <SkeletonRows rows={4} />
        ) : !peers.data?.length ? (
          <EmptyState
            compact
            title="Nobody else to compare yet"
            description="Other active applicants on this job show up here."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {peers.data.map((peer) => {
              const on = picked.includes(peer.id);
              return (
                <li key={peer.id} className="py-2.5">
                  <Checkbox
                    checked={on}
                    disabled={!on && picked.length >= MAX_OTHERS}
                    onCheckedChange={(value) => toggle(peer.id, value)}
                    label={peer.name}
                    description={`${peer.stage} · ${peer.scorecards} ${peer.scorecards === 1 ? 'scorecard' : 'scorecards'}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}

type Comparison = {
  requisitionId: string;
  requisitionTitle: string;
  applicants: Array<{
    id: string;
    candidateId: string;
    candidateName: string;
    candidateTitle?: string | null;
    stage: string;
    status: string;
    appliedAt: string;
    blinded: boolean;
    decision: {
      decision: 'Advance' | 'Offer' | 'Reject';
      rationale: string;
      decidedAt: string;
    } | null;
    offer: {
      status: string;
      baseSalary?: number | null;
      currency: string;
      payPeriod: string;
    } | null;
    feedback: {
      submitted: number | null;
      expected: number;
      average: number | null;
      recommendations: Record<string, number>;
    };
  }>;
  competencies: Array<{
    id: string;
    name: string;
    kit: string;
    scores: Record<string, { average: number; count: number }>;
  }>;
};

const decisionLabel = {
  Advance: { text: 'Move forward', tone: 'blue' },
  Offer: { text: 'Make an offer', tone: 'green' },
  Reject: { text: 'Reject', tone: 'red' },
} as const;

const per = { Year: 'a year', Month: 'a month', Hour: 'an hour' } as Record<string, string>;

/** Two to four finalists on one job, side by side: scores by competency, decision and offer. */
export function ApplicantComparison({ ids }: { ids: string }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['application-compare', ids],
    queryFn: () => api.get<Comparison>(`/api/applications/compare?ids=${encodeURIComponent(ids)}`),
  });
  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  const { applicants, competencies } = query.data;
  const without = (id: string) =>
    router.push(
      `/applications/compare?ids=${applicants
        .filter((item) => item.id !== id)
        .map((item) => item.id)
        .join(',')}`,
    );
  // The best average in a row stands out, so the strongest person per competency is easy to spot.
  const best = (scores: Record<string, { average: number }>) =>
    Math.max(...Object.values(scores).map((item) => item.average));
  const columns = `minmax(7.5rem,12rem) repeat(${applicants.length}, minmax(10rem,1fr))`;

  const row = (
    label: string,
    cells: (applicant: Comparison['applicants'][number]) => ReactNode,
    hint?: string,
  ) => (
    <div
      role="row"
      className="grid border-t border-border-subtle"
      style={{ gridTemplateColumns: columns }}
    >
      <div
        role="rowheader"
        // Stays in view while the applicants scroll sideways on a phone.
        className="sticky left-0 z-[1] bg-card px-4 py-3 text-sm font-medium text-fg-muted"
      >
        {label}
        {hint && <span className="block text-xs font-normal text-fg-subtle">{hint}</span>}
      </div>
      {applicants.map((applicant) => (
        <div role="cell" key={applicant.id} className="min-w-0 px-4 py-3 text-sm text-fg">
          {cells(applicant)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Jobs', href: '/jobs' },
          { label: query.data.requisitionTitle, href: `/jobs/${query.data.requisitionId}` },
          { label: 'Compare applicants' },
        ]}
        title="Compare applicants"
      />
      <Card className="overflow-x-auto">
        <div role="table" aria-label="Applicants side by side" className="min-w-fit">
          <div role="row" className="grid" style={{ gridTemplateColumns: columns }}>
            <div role="columnheader" className="sticky left-0 z-[1] bg-card px-4 py-4" />
            {applicants.map((applicant) => (
              <div
                role="columnheader"
                key={applicant.id}
                className="flex min-w-0 items-start gap-3 px-4 py-4"
              >
                <span className="hidden sm:block" aria-hidden>
                  <Avatar name={applicant.candidateName} size="md" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/applications/${applicant.id}/scorecards`}
                    className="block truncate text-base font-semibold text-fg hover:text-accent-foreground hover:underline"
                  >
                    {applicant.candidateName}
                  </Link>
                  {applicant.candidateTitle && (
                    <p className="truncate text-xs text-fg-subtle">{applicant.candidateTitle}</p>
                  )}
                </div>
                {applicants.length > 2 && (
                  <IconButton
                    label={`Remove ${applicant.candidateName} from the comparison`}
                    variant="quiet"
                    size="sm"
                    onClick={() => without(applicant.id)}
                  >
                    <X />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {row('Stage', (a) =>
            a.status === 'Active' ? (
              a.stage
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                {a.stage} <StatusBadge status={a.status} size="sm" />
              </span>
            ),
          )}
          {row('Decision', (a) =>
            a.decision ? (
              <div className="space-y-1">
                <Badge tone={decisionLabel[a.decision.decision].tone}>
                  {decisionLabel[a.decision.decision].text}
                </Badge>
                <p className="line-clamp-3 text-xs text-fg-muted">{a.decision.rationale}</p>
                <p className="text-2xs text-fg-subtle">{formatDate(a.decision.decidedAt)}</p>
              </div>
            ) : (
              <span className="text-fg-subtle">No decision yet</span>
            ),
          )}
          {row('Offer', (a) =>
            a.offer ? (
              <div className="space-y-1">
                <StatusBadge status={a.offer.status} size="sm" />
                {a.offer.baseSalary != null && (
                  <p className="text-xs text-fg-muted tnum">
                    {new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: a.offer.currency,
                      maximumFractionDigits: 0,
                    }).format(a.offer.baseSalary)}{' '}
                    {per[a.offer.payPeriod] ?? ''}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-fg-subtle">No offer</span>
            ),
          )}
          {row('Feedback', (a) =>
            a.blinded ? (
              <span className="flex items-center gap-1.5 text-fg-subtle">
                <Lock className="size-3.5" aria-hidden />
                Hidden until you submit your scorecard
              </span>
            ) : (
              <div className="space-y-1.5">
                <p className="tnum">
                  {a.feedback.submitted} of{' '}
                  {Math.max(a.feedback.expected, a.feedback.submitted ?? 0)} scorecards in
                  {a.feedback.average != null && (
                    <span className="text-fg-muted">
                      {' '}
                      · average {oneDecimal(a.feedback.average)}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1">
                  {[...RECOMMENDATIONS].reverse().map((call) =>
                    a.feedback.recommendations[call.value] ? (
                      <Badge
                        key={call.value}
                        size="sm"
                        tone={call.value.endsWith('Yes') ? 'green' : 'red'}
                      >
                        {a.feedback.recommendations[call.value]} {call.label}
                      </Badge>
                    ) : null,
                  )}
                </div>
              </div>
            ),
          )}
          <div
            role="row"
            className="border-t border-border bg-muted px-4 py-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
          >
            <span role="columnheader">Scores by competency, 1 to 5</span>
          </div>
          {competencies.length === 0 ? (
            <p className="border-t border-border-subtle px-4 py-4 text-sm text-fg-subtle">
              No competency scores yet.
            </p>
          ) : (
            competencies.map((competency) => {
              const top = best(competency.scores);
              return (
                <div key={competency.id}>
                  {row(
                    competency.name,
                    (a) => {
                      const score = competency.scores[a.id];
                      if (!score) return <span className="text-fg-subtle">–</span>;
                      return (
                        <span className="flex items-center gap-2">
                          <ScoreChip
                            value={score.average}
                            className={
                              score.average === top && applicants.length > 1
                                ? 'ring-2 ring-tone-green-dot/50'
                                : undefined
                            }
                          />
                          <span className="text-xs text-fg-subtle tnum">
                            {score.count} {score.count === 1 ? 'score' : 'scores'}
                          </span>
                        </span>
                      );
                    },
                    competency.kit,
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
