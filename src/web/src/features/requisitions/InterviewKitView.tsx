'use client';

import Link from 'next/link';
import { Text } from '@mantine/core';
import { IconArrowLeft, IconPencil } from '@tabler/icons-react';
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
  const kitsHref = `/requisitions/${requisitionId}/kits`;
  const editHref = `/requisitions/${requisitionId}/kits/${kit.id}/edit`;

  return (
    <article className="kit-read">
      <p className="kit-read-bar">
        <Link href={kitsHref} className="kit-read-btn">
          <IconArrowLeft size={15} aria-hidden />
          All kits
        </Link>
        <span className="kit-read-sep" aria-hidden />
        <span className="kit-read-meta">{kit.durationMinutes} min</span>
        {canManage && (
          <>
            <span className="kit-read-sep" aria-hidden />
            <Link href={editHref} className="kit-read-btn">
              <IconPencil size={15} aria-hidden />
              Edit
            </Link>
          </>
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
