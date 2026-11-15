'use client';

import { PipelineView } from '@/features/pipeline/PipelineView';
import { asJob, useAbility } from '@/lib/ability';
import type { BoardData } from '@/types';
import { useRequisition } from './requisition-data';

/** The job's Pipeline tab: the board, or the same people as a table. "Find candidates" is in the header. */
export function RequisitionPipeline({
  id,
  initialData,
  view,
}: {
  id: string;
  initialData?: BoardData;
  /** Board or List from the address, for example after the old Candidates page redirects here. */
  view?: 'board' | 'list';
}) {
  const details = useRequisition(id);
  const canManage = useAbility().can('update', asJob(details.data ?? {}));
  return (
    <PipelineView requisitionId={id} initialData={initialData} canManage={canManage} view={view} />
  );
}
