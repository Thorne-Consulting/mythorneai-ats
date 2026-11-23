'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { PipelineTemplate } from '@/features/admin/PipelineTemplatesSection';
import { StageBadge } from '@/components/status';
import { Button, Modal, Select, toast } from '@/components/ui';
import type { Stage } from '@/types';

/**
 * Give this job another pipeline. Its stages replace the job's open stages; Hired stays with its
 * people. For every current stage with people, pick the new stage they go to.
 */
export function ChangePipelineModal({
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
  const pipelines = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
    enabled: opened,
  });
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  // Current stage id → position in the new pipeline, as a string for the select.
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  useEffect(() => {
    if (opened) {
      setPipelineId(null);
      setMoveTo({});
    }
    // Reset only when the dialog opens.
  }, [opened]);

  const pipeline = (pipelines.data ?? []).find((p) => p.id === pipelineId);
  const fresh = pipeline?.stages ?? [];
  const crowded = stages.filter((s) => !s.isTerminal && (s.count ?? 0) > 0);
  // People go to the first new stage of the same type, else the first stage, unless someone picks.
  const destination = (stage: Stage) =>
    moveTo[stage.id] ??
    String(
      Math.max(
        0,
        fresh.findIndex((f) => f.type === stage.type),
      ),
    );

  const save = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${requisitionId}/pipeline`, {
        pipelineTemplateId: pipelineId,
        moveTo: Object.fromEntries(crowded.map((s) => [s.id, Number(destination(s))])),
      }),
    onSuccess: () => {
      for (const key of [
        ['board', requisitionId],
        ['requisition', requisitionId],
        ['requisition-stats', requisitionId],
      ])
        queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-templates'] });
      toast.success('Pipeline changed');
      onClose();
    },
    onError: (error: Error) => toast.error('Could not change the pipeline', error.message),
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Change pipeline"
      description="The pipeline's stages replace this job's stages. People in Hired stay there."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!pipeline || fresh.length === 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Change pipeline
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Pipeline"
          placeholder="Choose a pipeline"
          value={pipelineId}
          onChange={(value) => {
            setPipelineId(value);
            setMoveTo({});
          }}
          data={(pipelines.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        {pipeline && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
            {fresh.map((s) => (
              <StageBadge key={s.id} stage={s.name} type={s.type} size="sm" />
            ))}
            <span>then</span>
            <StageBadge stage="Hired" type="Hired" size="sm" />
          </div>
        )}
        {pipeline && crowded.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-muted p-3">
            <p className="text-sm font-medium text-fg">Where people in the current stages go</p>
            {crowded.map((stage) => (
              <Select
                key={stage.id}
                label={`From ${stage.name} (${stage.count} active)`}
                value={destination(stage)}
                onChange={(value) => value !== null && setMoveTo({ ...moveTo, [stage.id]: value })}
                data={fresh.map((s, index) => ({ value: String(index), label: s.name }))}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
