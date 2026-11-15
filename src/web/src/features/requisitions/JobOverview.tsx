'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock3,
  PencilLine,
  Timer,
  Users,
} from 'lucide-react';
import { api } from '@/api';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  EmptyState,
  SkeletonRows,
  Timeline,
  toneDot,
} from '@/components/ui';
import { ActivityList } from '@/features/dashboard/ActivityList';
import { stageTone, statusLabel, statusTones } from '@/components/status';
import { asJob, canManageWorkspace, useAbility } from '@/lib/ability';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { personName, useRequisition } from './requisition-data';
import { SuggestedCandidates } from './SuggestedCandidates';
import { parseRequirements, type RequisitionWithSettings } from './requirements-types';

type Step = { title: string; detail: string; href?: string; action?: string };

/** GET /api/requisitions/{id}/stats: the job's health. */
type JobStats = {
  total: number;
  active: number;
  hired: number;
  rejected: number;
  daysOpen: number | null;
  daysToFirstReview: number | null;
  feedbackOwed: number;
  stages: {
    id: string;
    name: string;
    type: string;
    color: string | null;
    targetDays: number | null;
    count: number;
    reached: number;
    medianDays: number | null;
  }[];
  sources: { source: string; count: number; hired: number }[];
  upcoming: {
    id: string;
    applicationId: string;
    title: string;
    startsAt: string;
    candidateName: string;
  }[];
};

type StatusChange = {
  occurredAt: string;
  actorEmail: string;
  actorName?: string | null;
  from: string | null;
  to: string | null;
  reason: string | null;
  rejected: number;
  duplicatedFrom: string | null;
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** What is waiting on this job, most blocking first. The header holds open and approval. */
function nextSteps(
  job: RequisitionWithSettings,
  candidates: number,
  canManage: boolean,
  canFind: boolean,
): Step[] {
  const base = `/jobs/${job.id}`;
  const steps: Step[] = [];
  if (job.status === 'Draft')
    steps.push({
      title: 'Still a draft',
      detail: 'People can apply once the job is open. Use the button at the top of the page.',
    });
  if (job.status === 'OnHold')
    steps.push({
      title: 'On hold',
      detail: 'People can’t see it on your careers site until you open it again.',
    });
  if (job.interviewKits.length === 0)
    steps.push({
      title: 'No interview kit yet',
      detail: 'Give every interviewer the same questions and scoring scale.',
      href: canManage ? `${base}/kits/new` : `${base}/kits`,
      action: canManage ? 'Add a kit' : 'View kits',
    });
  const req = parseRequirements(job.requirementsJson);
  if (!req || (req.required.length === 0 && req.preferred.length === 0))
    steps.push({
      title: 'No requirements written',
      detail: 'Requirements help us match candidates and keep screening fair.',
      href: `${base}/requirements`,
      action: 'Write requirements',
    });
  if (!job.description?.trim())
    steps.push({
      title: 'No job description',
      detail: 'Without one, applicants see an empty job posting.',
      href: `${base}/posting`,
      action: canManage ? 'Write the posting' : 'View posting',
    });
  if (job.status === 'Open' && candidates === 0 && canManage && canFind)
    steps.push({
      title: 'No candidates yet',
      detail: 'Share the job posting, or add people you already have on file.',
      href: `/candidates?find=${job.id}`,
      action: 'Find candidates',
    });
  return steps;
}

/** One number in the job's health row. */
function HealthItem({
  label,
  value,
  hint,
  href,
  warn,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  warn?: boolean;
}) {
  const body = (
    <>
      <span className="block text-xs text-fg-subtle">{label}</span>
      <span
        className={cn(
          'mt-1 block truncate text-2xl font-bold tnum',
          warn ? 'text-tone-amber-fg' : 'text-fg',
        )}
      >
        {value}
      </span>
      {hint && <span className="mt-0.5 line-clamp-2 text-2xs text-fg-subtle">{hint}</span>}
    </>
  );
  // Borders between the cells: a 2 by 2 grid on small screens, one row on large ones.
  const cell =
    'min-w-0 border-border-subtle px-5 py-4 [&:nth-child(-n+2)]:max-lg:border-b [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r';
  return href ? (
    <Link href={href} className={cn(cell, 'transition-colors hover:bg-muted')}>
      {body}
    </Link>
  ) : (
    <div className={cell}>{body}</div>
  );
}

/** One line per status change: who, when, why, and what happened to candidates. */
function historyEntry(change: StatusChange, i: number) {
  const who = personName(
    change.actorName ? { displayName: change.actorName } : null,
    change.actorEmail,
  );
  const title = change.from
    ? `${statusLabel(change.from)} → ${statusLabel(change.to ?? '')}`
    : change.duplicatedFrom
      ? `Created as a copy of ${change.duplicatedFrom}`
      : 'Created as a draft';
  const notes = [
    change.reason,
    change.rejected ? `${plural(change.rejected, 'candidate')} rejected` : null,
  ].filter(Boolean);
  return {
    id: `${change.occurredAt}-${i}`,
    title,
    tone: statusTones[change.to ?? 'Draft'] ?? 'gray',
    meta: `${who} · ${formatDateTime(change.occurredAt)}`,
    body: notes.length ? notes.join(' · ') : undefined,
  };
}

export function JobOverview({ id }: { id: string }) {
  const details = useRequisition(id);
  const ability = useAbility();
  const canManage = ability.can('update', asJob(details.data ?? {}));
  // Finding people on file and suggestions are for whoever keeps the candidate records.
  const canFind = ability.can('update', 'Candidate');
  const history = useQuery({
    queryKey: ['requisition-status-history', id],
    queryFn: () => api.get<StatusChange[]>(`/api/requisitions/${id}/status-history`),
  });
  const stats = useQuery({
    queryKey: ['requisition-stats', id],
    queryFn: () => api.get<JobStats>(`/api/requisitions/${id}/stats`),
  });
  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const job = details.data as RequisitionWithSettings;
  const total = job.stages.reduce((sum, stage) => sum + (stage.count ?? 0), 0);
  const steps = nextSteps(job, total, canManage, canFind);
  const data = stats.data;
  const most = Math.max(1, ...(data?.stages.map((stage) => stage.count) ?? []));

  return (
    <div className="flex flex-col gap-5">
      <Card className="grid grid-cols-2 lg:grid-cols-4">
        <HealthItem label="Days open" value={data ? (data.daysOpen ?? 'Not open yet') : '…'} />
        <HealthItem
          label="Days to first review"
          value={data ? (data.daysToFirstReview ?? '–') : '…'}
          hint="Average time from applying to the first move"
        />
        <HealthItem
          label="Feedback owed"
          value={data ? data.feedbackOwed : '…'}
          hint={
            data?.feedbackOwed ? 'Scorecards missing after interviews' : 'All scorecards are in'
          }
          warn={!!data?.feedbackOwed}
        />
        <HealthItem
          label="Hired"
          value={data ? `${data.hired} of ${job.openings}` : '…'}
          hint={job.openings === 1 ? 'opening' : 'openings'}
        />
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader
              title="Pipeline"
              description={
                data && data.total > 0
                  ? `${data.total === 1 ? '1 person' : `${data.total} people`} applied. Reached counts everyone who got at least that far, including people who were rejected later.`
                  : undefined
              }
              action={<CardLink href={`/jobs/${id}/pipeline`}>Open pipeline</CardLink>}
            />
            <CardBody>
              {!data ? (
                <SkeletonRows rows={4} className="px-0" />
              ) : data.total === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="No candidates yet"
                  description="This fills in as people apply and move through the stages."
                  action={
                    canManage && canFind && job.status === 'Open' ? (
                      <Button asChild variant="secondary">
                        <Link href={`/candidates?find=${id}`}>Find candidates</Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-subtle">
                      <th className="pb-2 font-normal">Stage</th>
                      <th className="pb-2 font-normal max-sm:hidden">
                        <span className="sr-only">Share</span>
                      </th>
                      <th className="pb-2 text-right font-normal">Now</th>
                      <th className="pb-2 text-right font-normal">Reached</th>
                      <th className="pb-2 text-right font-normal max-sm:hidden">Median days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stages.map((stage) => {
                      const tone = toneDot(stageTone(stage.type, stage.color));
                      const share = Math.round((stage.reached / data.total) * 100);
                      const slow =
                        stage.targetDays &&
                        stage.medianDays !== null &&
                        stage.medianDays > stage.targetDays;
                      return (
                        <tr key={stage.id} className="border-t border-border-subtle">
                          <td className="py-2.5 pr-3">
                            <span className="flex min-w-0 items-center gap-2 text-fg">
                              <span
                                aria-hidden
                                className={cn('size-2 shrink-0 rounded-full', tone)}
                              />
                              <span className="truncate">{stage.name}</span>
                            </span>
                          </td>
                          <td className="w-[40%] py-2.5 pr-4 max-sm:hidden">
                            <span className="block h-2 overflow-hidden rounded-full bg-secondary">
                              <span
                                className={cn('block h-full rounded-full', tone)}
                                // Dynamic share of the fullest stage.
                                style={{ width: `${(stage.count / most) * 100}%` }}
                              />
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-fg tnum">
                            {stage.count}
                          </td>
                          <td className="py-2.5 pl-3 text-right text-fg-muted tnum">
                            {stage.reached}{' '}
                            <span className="text-xs text-fg-subtle">({share}%)</span>
                          </td>
                          <td
                            className={cn(
                              'py-2.5 pl-3 text-right tnum max-sm:hidden',
                              slow ? 'font-medium text-tone-amber-fg' : 'text-fg-muted',
                            )}
                            title={
                              stage.targetDays
                                ? `Target: ${plural(stage.targetDays, 'day')}`
                                : undefined
                            }
                          >
                            {stage.medianDays ?? '–'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent activity" />
            <ActivityList requisitionId={id} take={8} showJob={false} />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Next steps" />
            <CardBody>
              {steps.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-fg-muted">
                  <CircleCheck className="size-4 text-tone-green-dot" aria-hidden />
                  Nothing waiting. This job is set up.
                </p>
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {steps.map((step) => (
                    <li key={step.title}>
                      <p className="text-sm font-medium text-fg">{step.title}</p>
                      <p className="mt-0.5 text-xs text-fg-subtle">{step.detail}</p>
                      {step.href && (
                        <Link
                          href={step.href}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
                        >
                          {step.action}
                          <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {canManage && canFind && <SuggestedCandidates id={id} />}

          {data && data.upcoming.length > 0 && (
            <Card>
              <CardHeader title="Coming up" />
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {data.upcoming.map((interview) => (
                  <li key={interview.id}>
                    <Link
                      href={`/applications/${interview.applicationId}/interviews`}
                      className="block px-5 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="block truncate text-sm font-medium text-fg">
                        {interview.candidateName}
                      </span>
                      <span className="block truncate text-2xs text-fg-subtle">
                        {interview.title} · {formatDateTime(interview.startsAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data && data.sources.length > 0 && (
            <Card>
              <CardHeader title="Where candidates come from" />
              <CardBody>
                <ul className="flex flex-col gap-2">
                  {data.sources.slice(0, 3).map((source) => (
                    <li
                      key={source.source}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="truncate text-fg">{source.source}</span>
                      <span className="shrink-0 text-fg-muted tnum">
                        {source.count}
                        {source.hired > 0 && (
                          <span className="text-xs text-fg-subtle"> · {source.hired} hired</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Status history"
              action={
                canManageWorkspace(ability) ? (
                  <CardLink href={`/settings/activity?type=Requisition&entityId=${id}`}>
                    All changes
                  </CardLink>
                ) : undefined
              }
            />
            <CardBody>
              {!history.data ? (
                <SkeletonRows rows={2} className="px-0" />
              ) : history.data.length > 0 ? (
                <Timeline items={history.data.map(historyEntry)} />
              ) : (
                // Jobs from before we kept this history: show the dates we do know.
                <Timeline
                  items={[
                    ...(job.openedAt
                      ? [
                          {
                            id: 'opened',
                            title: 'First opened',
                            tone: 'green' as const,
                            meta: formatDate(job.openedAt),
                          },
                        ]
                      : []),
                    { id: 'created', title: 'Created', meta: formatDate(job.createdAt) },
                  ]}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
