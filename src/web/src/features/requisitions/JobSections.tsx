'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Pencil, UserPlus, Users } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  EmptyState,
  FilterSelect,
  SearchInput,
  SkeletonRows,
  TableToolbar,
} from '@/components/ui';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { humanize } from '@/lib/format';
import { ApplicantsTable } from '@/features/pipeline/ApplicantsTable';
import { nameFromEmail, useBoard, useCanManage, useRequisition } from './requisition-data';
import { RequisitionRequirements } from './RequisitionRequirements';
import type { RequisitionWithSettings } from './requirements-types';

function Loading() {
  return (
    <Card>
      <SkeletonRows rows={4} />
    </Card>
  );
}

function FindCandidates({ id, label = 'Find candidates' }: { id: string; label?: string }) {
  return (
    <Button asChild variant="secondary">
      <Link href={`/candidates?job=${id}`}>
        <UserPlus />
        {label}
      </Link>
    </Button>
  );
}

/** This job's active applicants as a sortable, exportable table. */
export function JobCandidates({ id }: { id: string }) {
  const details = useRequisition(id);
  const board = useBoard(id);
  const canManage = useCanManage(details.data);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  if (!board.data) return <Loading />;
  const stages = board.data.stages;
  const total = stages.reduce((sum, s) => sum + s.applications.length, 0);

  return (
    <Card className="px-4 pb-2">
      <CardHeader
        className="px-1"
        title="Candidates"
        description="Everyone active on this job. Open a row to see their application."
      />
      {total === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="No active candidates yet"
          description="Applicants show up here as they apply or are added to this job."
          action={canManage ? <FindCandidates id={id} /> : undefined}
        />
      ) : (
        <>
          <TableToolbar className="pb-0">
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search name, title or skill"
              className="w-full sm:w-64"
            />
            <FilterSelect
              allLabel="All stages"
              value={stage}
              onChange={setStage}
              data={stages.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.applications.length})`,
              }))}
            />
          </TableToolbar>
          <ApplicantsTable
            stages={stages}
            viewKey="job-candidates"
            exportName={`${board.data.code}-candidates`}
            search={search}
            stageIds={stage ? [stage] : undefined}
          />
        </>
      )}
    </Card>
  );
}

export function JobRequirements({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);
  if (!details.data) return <Loading />;
  return (
    <Card>
      <RequisitionRequirements
        requisition={details.data as RequisitionWithSettings}
        canManage={canManage}
      />
    </Card>
  );
}

/** Who owns the hire and who else can see it. Edited on the Settings page (owner, recruiter, viewers). */
export function HiringTeam({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);
  if (!details.data) return <Loading />;
  const job = details.data as RequisitionWithSettings;
  const people = [
    {
      email: job.ownerEmail,
      role: 'Hiring manager',
      note: 'Owns the hire and makes the final call.',
    },
    {
      email: job.recruiterEmail,
      role: 'Recruiter',
      note: 'Runs the process and moves candidates.',
    },
    ...(job.viewerEmails ?? [])
      .filter((email) => email !== job.ownerEmail && email !== job.recruiterEmail)
      .map((email) => ({
        email,
        role: 'Can view',
        note: 'Named on this job; sees it even when confidential.',
      })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader
          title="Hiring team"
          description="The people responsible for this job."
          action={
            canManage && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/jobs/${id}/settings`}>
                  <Pencil />
                  Edit team
                </Link>
              </Button>
            )
          }
        />
        <ul className="border-t border-border-subtle">
          {people.map((person) => (
            <li
              key={`${person.role}-${person.email}`}
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
            >
              <Avatar name={nameFromEmail(person.email)} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-fg">
                  {nameFromEmail(person.email)}
                </p>
                <a
                  href={`mailto:${person.email}`}
                  className="truncate text-xs text-fg-subtle hover:text-accent-foreground hover:underline"
                >
                  {person.email}
                </a>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={person.role === 'Can view' ? 'gray' : 'blue'}>{person.role}</Badge>
                <p className="hidden text-2xs text-fg-subtle sm:block">{person.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Alert tone="neutral" title="Interviewers">
        Interviewers are picked for each interview when you schedule it, and see only the candidates
        they interview.
      </Alert>
    </div>
  );
}

/** The careers page as applicants will see it, and the link to share. */
export function JobPosting({ id }: { id: string }) {
  const details = useRequisition(id);
  const user = useCurrentUser();
  const canManage = useCanManage(details.data);
  // The origin is only known in the browser; render the path first to keep hydration stable.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  if (!details.data) return <Loading />;
  const job = details.data;
  const path = `/careers/${id}`;
  const isPublic = job.status === 'Open';

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Public link"
          description="Share this link anywhere you advertise the job."
        />
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-sm text-fg">{origin + path}</code>
            <CopyButton value={origin + path} label="Copy link" />
            {isPublic && (
              <Button asChild variant="quiet" size="sm">
                <a href={path} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open
                </a>
              </Button>
            )}
          </div>
          {!isPublic && (
            <Alert tone="warning" title="Not public yet">
              Only open jobs appear on the careers site. This job is{' '}
              {humanize(job.status).toLowerCase()}, so the link shows &ldquo;not found&rdquo; until
              it opens.
            </Alert>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Preview"
          description="Exactly what applicants see. Change the text under Settings."
          action={
            canManage && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/jobs/${id}/settings`}>
                  <Pencil />
                  Edit posting
                </Link>
              </Button>
            )
          }
        />
        <CardBody>
          <div className="rounded-lg border border-border-subtle bg-background p-5 sm:p-8">
            <JobPostingView
              job={job}
              company={user.organizationName}
              action={
                <Button disabled aria-describedby="apply-preview-note">
                  Apply for this job
                </Button>
              }
            />
            <p id="apply-preview-note" className="sr-only">
              Preview only; applying is turned off here.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
