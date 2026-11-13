'use client';

import Link from 'next/link';
import { ArrowRight, CircleCheck, Users } from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  DescriptionList,
  EmptyState,
  ProgressRow,
  SkeletonRows,
  toneDot,
} from '@/components/ui';
import { stageTone } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative } from '@/lib/format';
import type { BoardData } from '@/types';
import { stageFunnel } from '@/features/pipeline/pipeline-stats';
import { nameFromEmail, useBoard, useCanManage, useRequisition } from './requisition-data';
import { parseRequirements, type RequisitionWithSettings } from './requirements-types';

type Step = { title: string; detail: string; href?: string; action?: string };

/** What is waiting on this job, most blocking first. */
function nextSteps(job: RequisitionWithSettings, candidates: number, canManage: boolean): Step[] {
  const base = `/jobs/${job.id}`;
  const steps: Step[] = [];
  if (job.status === 'Draft')
    steps.push({
      title: 'Still a draft',
      detail: 'Use Change status to open the job or send it for approval. Then people can apply.',
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
      title: 'No job summary',
      detail: 'Without one, applicants see an empty job posting.',
      href: canManage ? `${base}/settings` : `${base}/posting`,
      action: canManage ? 'Add a summary' : 'View posting',
    });
  if (job.status === 'Open' && candidates === 0 && canManage)
    steps.push({
      title: 'No candidates yet',
      detail: 'Share the job posting, or add people you already have on file.',
      href: `/candidates?job=${job.id}`,
      action: 'Find candidates',
    });
  return steps;
}

export function JobOverview({ id, initialBoard }: { id: string; initialBoard?: BoardData }) {
  const details = useRequisition(id);
  const board = useBoard(id, initialBoard);
  const canManage = useCanManage(details.data);
  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const job = details.data as RequisitionWithSettings;
  const funnel = stageFunnel(board.data?.stages ?? []);
  const total = funnel[0]?.reached ?? 0;
  const steps = nextSteps(job, total, canManage);
  const base = `/jobs/${id}`;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader
            title="Candidates by stage"
            action={<CardLink href={`${base}/pipeline`}>Open pipeline</CardLink>}
          />
          <CardBody>
            {!board.data ? (
              <SkeletonRows rows={2} className="px-0" />
            ) : (
              <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                {funnel.map((stage) => (
                  <li key={stage.id} className="rounded-lg bg-well px-3 py-2.5">
                    <p className="flex items-center gap-1.5 truncate text-xs text-fg-muted">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          toneDot(stageTone(stage.name)),
                        )}
                      />
                      {stage.name}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-fg tnum">{stage.count}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Funnel"
            description="How many active candidates reached each stage or went past it."
          />
          <CardBody>
            {!board.data ? (
              <SkeletonRows rows={4} className="px-0" />
            ) : total === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No active candidates yet"
                description="This fills in as people apply and move through the stages."
                action={
                  canManage ? (
                    <Button asChild variant="secondary">
                      <Link href={`/candidates?job=${id}`}>Find candidates</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                {funnel.map((stage) => (
                  <ProgressRow
                    key={stage.id}
                    label={stage.name}
                    value={stage.reached}
                    max={total}
                    display={`${stage.reached} · ${Math.round((stage.reached / total) * 100)}%`}
                    tone={stageTone(stage.name)}
                  />
                ))}
              </div>
            )}
          </CardBody>
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

        <Card>
          <CardHeader
            title="Hiring team"
            action={<CardLink href={`${base}/team`}>View all</CardLink>}
          />
          <CardBody>
            <ul className="flex flex-col gap-3">
              {[
                { email: job.ownerEmail, role: 'Hiring manager' },
                { email: job.recruiterEmail, role: 'Recruiter' },
              ].map((person) => (
                <li key={person.role} className="flex items-center gap-3">
                  <Avatar name={nameFromEmail(person.email)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg" title={person.email}>
                      {nameFromEmail(person.email)}
                    </p>
                    <p className="text-xs text-fg-subtle">{person.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Key facts"
            action={<CardLink href={`${base}/details`}>Details</CardLink>}
          />
          <CardBody>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Openings', value: job.openings },
                { label: 'Employment type', value: job.employmentType },
                { label: 'Target start', value: formatDate(job.targetStartDate) },
                { label: 'Created', value: formatDate(job.createdAt) },
                { label: 'Updated', value: formatRelative(job.updatedAt) },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
