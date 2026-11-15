'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { useLibrary } from '@/features/assessments/api';
import {
  StageListEditor,
  fromDraft,
  stageListProblem,
  toDraft,
  type StageDraft,
} from '@/components/pipeline/StageListEditor';
import { StageBadge } from '@/components/status';
import { Button, Modal, Select, toast } from '@/components/ui';
import type { Stage } from '@/types';

/** Published assessments a stage can use, as options. */
export function useStageAssessments(enabled = true) {
  const library = useLibrary();
  if (!enabled) return [];
  return (library.data ?? [])
    .filter((a) => a.status === 'Active')
    .map((a) => ({ value: a.id, label: a.name }));
}

/**
 * Edit this job's stages: add, rename, reorder, set the type, what candidates see, the email on
 * entry and target days. Removing a stage asks where its people go. Hired stays last.
 */
export function StageEditor({
  requisitionId,
  stages,
  opened,
  onClose,
}: {
  requisitionId: string;
  stages: Stage[];
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const hired = stages.find((s) => s.isTerminal);
  const open = stages.filter((s) => !s.isTerminal);
  const [drafts, setDrafts] = useState<StageDraft[]>([]);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const assessments = useStageAssessments(opened);
  useEffect(() => {
    if (opened) {
      setDrafts(open.map(toDraft));
      setMoveTo({});
    }
    // Reset only when the dialog opens.
  }, [opened]);

  const kept = drafts.filter((d) => d.id);
  const removed = open.filter((s) => !drafts.some((d) => d.id === s.id));
  // Removed people go to the nearest kept stage before theirs unless someone picks another.
  const destination = (stage: Stage) =>
    moveTo[stage.id] ??
    [...kept]
      .reverse()
      .find((d) => (open.find((s) => s.id === d.id)?.sortOrder ?? 0) < stage.sortOrder)?.id ??
    kept[0]?.id;
  const problem =
    stageListProblem(drafts, 20) ??
    (removed.length > 0 && kept.length === 0
      ? 'Keep at least one of the current stages, so the people in removed stages have somewhere to go.'
      : null);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/requisitions/${requisitionId}/stages`, {
        stages: [
          ...drafts.map(fromDraft),
          {
            id: hired!.id,
            name: hired!.name,
            type: 'Hired',
            candidateLabel: hired!.candidateLabel ?? null,
            emailOnEntry: 'Off',
            targetDays: null,
          },
        ],
        moveTo: Object.fromEntries(removed.map((s) => [s.id, destination(s)])),
      }),
    onSuccess: () => {
      for (const key of [
        ['board', requisitionId],
        ['requisition', requisitionId],
        ['requisition-stats', requisitionId],
      ])
        queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Stages saved');
      onClose();
    },
    onError: (error: Error) => toast.error('Could not save the stages', error.message),
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit stages"
      description="Changes apply to this job only. Drag a stage by its handle to change the order."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!!problem || !hired}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save stages
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <StageListEditor
          stages={drafts}
          onChange={setDrafts}
          max={20}
          assessments={assessments}
          after={
            hired && (
              <span className="flex items-center gap-2 text-xs text-fg-subtle">
                Then <StageBadge stage={hired.name} type="Hired" size="sm" /> through an accepted
                offer
              </span>
            )
          }
        />
        {removed.length > 0 && kept.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-muted p-3">
            <p className="text-sm font-medium text-fg">Where people in removed stages go</p>
            {removed.map((stage) => (
              <Select
                key={stage.id}
                label={`From ${stage.name}${stage.count ? ` (${stage.count} active)` : ''}`}
                value={destination(stage) ?? null}
                onChange={(value) => value && setMoveTo({ ...moveTo, [stage.id]: value })}
                data={kept.map((d) => ({ value: d.id!, label: d.name || 'Unnamed stage' }))}
              />
            ))}
          </div>
        )}
        {problem && drafts.length > 0 && (
          <p role="alert" className="text-xs text-destructive">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
