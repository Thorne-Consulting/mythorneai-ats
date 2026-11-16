'use client';

import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import { StageBadge } from '@/components/status';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import type { KitResponse } from '@/features/interview-library/library-model';
import { splitFollowUp } from '@/features/interview-library/library-model';
import { useRequisition } from './requisition-data';

/** One interview kit, read only: the instructions and every competency with its question. */
export function InterviewKitView({
  requisitionId,
  data,
}: {
  requisitionId: string;
  data: KitResponse;
}) {
  const { kit } = data;
  const job = useRequisition(requisitionId);
  const stage = job.data?.stages.find((item) => item.id === kit.pipelineStageId);
  const total = kit.criteria.reduce((sum, item) => sum + item.weight, 0);

  return (
    <article className="max-w-[880px] space-y-4">
      {kit.versionOfId && (
        <Alert tone="info" title={`Version ${kit.version}, kept for the interviews that use it`}>
          {kit.interviews} {kit.interviews === 1 ? 'interview uses' : 'interviews use'} this
          version. It can no longer be changed.{' '}
          <Link
            href={`/jobs/${requisitionId}/kits/${kit.versionOfId}`}
            className="font-medium text-accent-foreground hover:underline"
          >
            Open the current version
          </Link>
        </Alert>
      )}
      <Card className="p-5 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-fg">{kit.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-subtle">
            <span className="flex items-center gap-1.5 tnum">
              <Clock3 className="size-4" aria-hidden />
              {kit.durationMinutes} minutes
            </span>
            {stage && (
              <StageBadge stage={stage.name} type={stage.type} color={stage.color} size="sm" />
            )}
          </div>
        </header>
        {kit.instructions && (
          <section className="mt-5">
            <h2 className="text-base font-semibold text-fg">Instructions</h2>
            <RichText markdown={kit.instructions} className="mt-2 text-base text-fg-muted" />
          </section>
        )}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-fg">Competencies</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {kit.criteria.map(splitFollowUp).map((item, index) => (
              <li key={item.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-fg">
                    <span className="mr-2 text-fg-subtle tnum">{index + 1}.</span>
                    {item.name}
                  </p>
                  <span className="text-xs text-fg-subtle tnum">
                    Weight {item.weight} · {total ? Math.round((item.weight / total) * 100) : 0}% of
                    the score
                  </span>
                </div>
                <p className="mt-2 text-base text-fg">{item.question}</p>
                {item.followUps && (
                  <p className="mt-2 text-sm text-fg-muted">
                    <span className="font-medium text-fg">Follow-ups: </span>
                    {item.followUps}
                  </p>
                )}
                {item.description && (
                  <p className="mt-1 text-sm text-fg-muted">
                    <span className="font-medium text-fg">A good answer shows: </span>
                    {item.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </Card>
    </article>
  );
}

export function KitGone({ requisitionId }: { requisitionId: string }) {
  return (
    <Card>
      <EmptyState
        compact
        title="This kit is not here"
        description="It may belong to another job. The job's own kits are on the Kits page."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/jobs/${requisitionId}/kits`}>All kits</Link>
          </Button>
        }
      />
    </Card>
  );
}
