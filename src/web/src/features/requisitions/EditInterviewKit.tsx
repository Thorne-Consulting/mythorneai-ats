'use client';

import { Text } from '@mantine/core';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { InterviewKitEditor } from './InterviewKitEditor';
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
  if (!job.data) return <LoadingBlock rows={4} />;
  const existing = job.data.interviewKits.find((kit) => kit.id === kitId);
  if (!existing) return <Text c="dimmed">This kit no longer exists.</Text>;
  return <InterviewKitEditor key={existing.id} requisitionId={requisitionId} existing={existing} />;
}
