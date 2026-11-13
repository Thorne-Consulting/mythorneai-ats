'use client';

import { Card, SkeletonRows } from '@/components/ui';
import { InterviewKitEditor } from './InterviewKitEditor';
import { KitGone } from './InterviewKitView';
import { useRequisition } from './requisition-data';

/** Loads a saved kit, then hands it to the same document editor used to create one. */
export function EditInterviewKit({
  requisitionId,
  kitId,
}: {
  requisitionId: string;
  kitId: string;
}) {
  const job = useRequisition(requisitionId);
  if (!job.data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  const existing = job.data.interviewKits.find((kit) => kit.id === kitId);
  if (!existing) return <KitGone kitsHref={`/jobs/${requisitionId}/kits`} />;
  return <InterviewKitEditor key={existing.id} requisitionId={requisitionId} existing={existing} />;
}
