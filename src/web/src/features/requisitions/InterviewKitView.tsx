'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3, Pencil } from 'lucide-react';
import { Button, Card, EmptyState, SkeletonRows } from '@/components/ui';
import { DocumentEditor } from '@/components/plate/document-editor';
import { kitToMarkdown } from './interview-kit-doc';
import { useCanManage, useRequisition } from './requisition-data';

/**
 * One interview kit, read in full. It renders the same document the editor shows, read-only, so
 * the page and the editor always look the same.
 */
export function InterviewKitView({
  requisitionId,
  kitId,
}: {
  requisitionId: string;
  kitId: string;
}) {
  const job = useRequisition(requisitionId);
  const canManage = useCanManage(job.data);
  const kitsHref = `/jobs/${requisitionId}/kits`;
  if (!job.data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  const kit = job.data.interviewKits.find((item) => item.id === kitId);
  if (!kit) return <KitGone kitsHref={kitsHref} />;
  const editHref = `/jobs/${requisitionId}/kits/${kit.id}/edit`;

  return (
    <article className="max-w-[880px] space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="quiet" size="sm">
          <Link href={kitsHref}>
            <ArrowLeft />
            All kits
          </Link>
        </Button>
        <span className="flex items-center gap-1.5 text-sm text-fg-subtle">
          <Clock3 className="size-4" aria-hidden />
          {kit.durationMinutes} minutes
        </span>
        {canManage && (
          <Button asChild variant="secondary" size="sm" className="ml-auto">
            <Link href={editHref}>
              <Pencil />
              Edit
            </Link>
          </Button>
        )}
      </div>
      <Card className="px-6 py-5">
        <DocumentEditor
          key={`${kit.id}-${kitToMarkdown(kit).length}`}
          readOnly
          value={kitToMarkdown(kit)}
        />
      </Card>
    </article>
  );
}

export function KitGone({ kitsHref }: { kitsHref: string }) {
  return (
    <Card>
      <EmptyState
        compact
        title="This kit no longer exists"
        description="Someone may have deleted it. The job's other kits are still there."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={kitsHref}>All kits</Link>
          </Button>
        }
      />
    </Card>
  );
}
