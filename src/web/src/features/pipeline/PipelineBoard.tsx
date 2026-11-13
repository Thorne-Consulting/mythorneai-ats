'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { Card, MenuItem, MenuLabel, RowActions, SkeletonRows, toast } from '@/components/ui';
import { Board, BoardColumn } from '@/components/pipeline/BoardColumn';
import { CandidateCard } from '@/components/pipeline/CandidateCard';
import { stageTone } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { BoardData } from '@/types';
import { useBoard, type BoardApplication } from '@/features/requisitions/requisition-data';
import { matchesApplicant } from './pipeline-stats';

/** What the card's detail line says: the next interview if there is one, else skills, else title. */
function detailOf(app: BoardApplication) {
  if (app.nextInterviewAt) return `Interview · ${formatDateTime(app.nextInterviewAt)}`;
  if (app.skills.length) return app.skills.slice(0, 3).join(' · ');
  return app.currentTitle ?? null;
}

/**
 * A job's candidates, a column per stage. Managers drag a card (or use its ••• menu) to move it;
 * the card moves at once and goes back with a toast if the server refuses.
 * Used by the job's Pipeline tab and the top-level Pipeline page.
 */
export function PipelineBoard({
  requisitionId,
  initialData,
  canManage,
  owner,
  search = '',
  stageIds,
  compact,
}: {
  requisitionId: string;
  initialData?: BoardData;
  canManage: boolean;
  /** Name shown as the card owner avatar (the job's recruiter). */
  owner?: string;
  /** Filters cards by candidate name, title or skill. */
  search?: string;
  /** Only these stages' columns; all when empty or missing. */
  stageIds?: string[];
  /** Name-only cards, so more fit on screen. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const board = useBoard(requisitionId, initialData);
  const [dragId, setDragId] = useState<string | null>(null);
  const key = ['board', requisitionId];

  const move = useMutation({
    mutationFn: ({ applicationId, stageId }: { applicationId: string; stageId: string }) =>
      api.patch<void>(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardData>(key);
      queryClient.setQueryData<BoardData>(key, (current) => {
        if (!current) return current;
        const moved = current.stages
          .flatMap((s) => s.applications)
          .find((a) => a.id === applicationId);
        if (!moved) return current;
        return {
          ...current,
          stages: current.stages.map((stage) => {
            const rest = stage.applications.filter((a) => a.id !== applicationId);
            return { ...stage, applications: stage.id === stageId ? [moved, ...rest] : rest };
          }),
        };
      });
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error('Could not move the candidate', error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
  });

  if (!board.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const stages = board.data.stages;

  const moveTo = (applicationId: string, stageId: string) => {
    const from = stages.find((s) => s.applications.some((a) => a.id === applicationId));
    if (from && from.id !== stageId) move.mutate({ applicationId, stageId });
  };

  return (
    <div>
      <Board>
        {stages
          .filter((stage) => !stageIds?.length || stageIds.includes(stage.id))
          .map((stage) => {
            const apps = stage.applications.filter((a) => matchesApplicant(a, search));
            return (
              <BoardColumn
                key={stage.id}
                title={stage.name}
                count={apps.length}
                tone={stageTone(stage.name)}
                menu={<span />}
                empty={canManage ? 'Drop a candidate here' : 'No candidates'}
                onDropItem={canManage ? (id) => moveTo(id, stage.id) : undefined}
              >
                {apps.map((app) => (
                  <CandidateCard
                    key={app.id}
                    {...rowLinkProps(`Open ${app.candidateName}`, () =>
                      router.push(`/applications/${app.id}`),
                    )}
                    className={cn(
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      compact && 'gap-1.5 p-2',
                    )}
                    name={app.candidateName}
                    subtitle={compact ? app.currentTitle : app.source}
                    detail={compact ? null : detailOf(app)}
                    timeInStage={compact ? null : formatRelative(app.lastActivityAt)}
                    owner={compact ? null : owner}
                    dragging={dragId === app.id}
                    draggable={canManage}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', app.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(app.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    aside={
                      <span
                        className="flex items-center gap-1"
                        // Menu clicks bubble through the portal to the card; keep them from opening it.
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {app.rating ? (
                          <span
                            className="text-xs font-semibold text-fg tnum"
                            title="Average rating"
                          >
                            {app.rating.toFixed(1)}
                          </span>
                        ) : null}
                        {canManage && (
                          <RowActions label={`Move ${app.candidateName}`} size="sm">
                            <MenuLabel>Move to</MenuLabel>
                            {stages
                              .filter((target) => target.id !== stage.id)
                              .map((target) => (
                                <MenuItem
                                  key={target.id}
                                  onSelect={() =>
                                    move.mutate({ applicationId: app.id, stageId: target.id })
                                  }
                                >
                                  {target.name}
                                </MenuItem>
                              ))}
                          </RowActions>
                        )}
                      </span>
                    }
                  />
                ))}
              </BoardColumn>
            );
          })}
      </Board>
      {canManage && (
        <p className="mt-1 text-xs text-fg-subtle">
          Drag a card to another stage, or use its ••• menu. Changes save right away.
        </p>
      )}
    </div>
  );
}
