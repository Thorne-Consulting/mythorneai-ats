'use client';

import Link from 'next/link';
import { Text } from '@mantine/core';
import { DocumentEditor } from '@/components/plate/document-editor';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
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
  if (!job.data) return <LoadingBlock rows={4} />;
  const kit = job.data.interviewKits.find((item) => item.id === kitId);
  if (!kit) return <Text c="dimmed">This kit no longer exists.</Text>;

  return (
    <article className="kit-read">
      <p className="kit-read-bar">
        <Link href={`/requisitions/${requisitionId}/kits`} className="text-action">
          All kits
        </Link>
        <span className="kit-read-meta">{kit.durationMinutes} min</span>
        {canManage && (
          <Link
            href={`/requisitions/${requisitionId}/kits/${kit.id}/edit`}
            className="text-action text-action-primary"
          >
            Edit
          </Link>
        )}
      </p>
      <DocumentEditor
        key={`${kit.id}-${kitToMarkdown(kit).length}`}
        readOnly
        value={kitToMarkdown(kit)}
      />
    </article>
  );
}
