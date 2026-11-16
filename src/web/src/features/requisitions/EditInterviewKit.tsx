'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/api';
import { Card, SkeletonRows } from '@/components/ui';
import { draftFromKit, type KitResponse } from '@/features/interview-library/library-model';
import { KitEditor } from './InterviewKitEditor';
import { InterviewKitView, KitGone } from './InterviewKitView';

export function useKit(requisitionId: string, kitId: string) {
  return useQuery({
    queryKey: ['interview-kits', requisitionId, kitId],
    queryFn: () =>
      api.get<KitResponse>(`/api/requisitions/${requisitionId}/interview-kits/${kitId}`),
  });
}

/**
 * One page per kit. People who manage the job edit it in place; everyone else reads it. An
 * earlier version that interviews still use opens read only.
 */
export function InterviewKitPage({
  requisitionId,
  kitId,
}: {
  requisitionId: string;
  kitId: string;
}) {
  const query = useKit(requisitionId, kitId);
  if (query.error instanceof ApiError && query.error.status === 404)
    return <KitGone requisitionId={requisitionId} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  if (!query.data.canManage)
    return <InterviewKitView requisitionId={requisitionId} data={query.data} />;
  return (
    <KitEditor
      key={`${query.data.kit.id}-${query.data.kit.version}`}
      requisitionId={requisitionId}
      initial={draftFromKit(query.data.kit)}
      saved={query.data}
    />
  );
}
