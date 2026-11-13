'use client';

import { PipelineView } from '@/features/pipeline/PipelineView';
import type { BoardData } from '@/types';
import { nameFromEmail, useCanManage, useRequisition } from './requisition-data';

/** The job's Pipeline section. "Find candidates" lives in the job header. */
export function RequisitionPipeline({ id, initialData }: { id: string; initialData?: BoardData }) {
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);
  return (
    <PipelineView
      requisitionId={id}
      initialData={initialData}
      canManage={canManage}
      owner={details.data ? nameFromEmail(details.data.recruiterEmail) : undefined}
    />
  );
}
