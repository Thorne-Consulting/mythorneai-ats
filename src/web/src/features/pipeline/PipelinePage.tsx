'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Button, Card, EmptyState, PageHeader, Select } from '@/components/ui';
import { StatusBadge } from '@/components/status';
import type { RequisitionSummary } from '@/types';
import { canManageJob, nameFromEmail, useBoard } from '@/features/requisitions/requisition-data';
import { PipelineView } from './PipelineView';

/** One open job's board at a time; the chosen job is kept in the URL (?job=). */
export function PipelinePage({
  jobs: initialJobs,
  initialJobId,
}: {
  jobs: RequisitionSummary[];
  initialJobId?: string;
}) {
  const user = useCurrentUser();
  const jobs =
    useQuery({
      queryKey: ['requisitions', 'open'],
      queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
      initialData: initialJobs,
    }).data ?? initialJobs;
  const [picked, setPicked] = useState(initialJobId);
  const job = jobs.find((j) => j.id === picked) ?? jobs[0];
  const canManage = job ? canManageJob(user, job) : false;

  const pick = (id: string | null) => {
    if (!id) return;
    setPicked(id);
    // ponytail: plain history API; Next keeps useSearchParams in sync and skips a server round trip.
    window.history.replaceState(null, '', `?job=${id}`);
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Keep every candidate moving, from first application to a great hire."
        actions={
          job &&
          canManage && (
            <Button asChild>
              <Link href={`/candidates?job=${job.id}`}>
                <Plus />
                Add candidate
              </Link>
            </Button>
          )
        }
      />
      {!job ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="No open jobs"
            description="A job's pipeline shows here once it is open. Open a job, or create one."
            action={
              <Button asChild variant="secondary">
                <Link href="/jobs">Go to jobs</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                aria-label="Job"
                value={job.id}
                onChange={pick}
                data={jobs.map((j) => ({ value: j.id, label: j.title }))}
                className="w-full sm:w-64"
              />
              <p className="text-sm text-fg-subtle">
                {job.department} · {job.location} · {job.employmentType}
              </p>
              <StatusBadge status={job.status} />
            </div>
            <JobStats job={job} />
          </Card>
          <PipelineView
            key={job.id}
            requisitionId={job.id}
            canManage={canManage}
            owner={nameFromEmail(job.recruiterEmail)}
          />
        </div>
      )}
    </>
  );
}

function JobStats({ job }: { job: RequisitionSummary }) {
  const board = useBoard(job.id);
  const total =
    board.data?.stages.reduce((sum, s) => sum + s.applications.length, 0) ?? job.activeApplications;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
      <span className="tnum">{total} active candidates</span>
      <span className="tnum">
        {job.openings} {job.openings === 1 ? 'opening' : 'openings'}
      </span>
      <span>Hiring manager: {nameFromEmail(job.ownerEmail)}</span>
      <Link href={`/jobs/${job.id}`} className="font-medium text-accent-foreground hover:underline">
        Open job
      </Link>
    </p>
  );
}
