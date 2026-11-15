'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Copy, GitBranch, PenLine, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/api';
import { StageBadge } from '@/components/status';
import {
  StageListEditor,
  fromDraft,
  stageListProblem,
  toDraft,
  type StageDraft,
} from '@/components/pipeline/StageListEditor';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  MenuItem,
  Modal,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { SettingsHeader } from './SettingsShell';
import { useStageAssessments } from '@/features/pipeline/StageEditor';

export interface PipelineTemplateStage {
  id: string;
  name: string;
  type: string;
  candidateLabel: string;
  emailOnEntry: 'Off' | 'Ask' | 'Always';
  targetDays: number | null;
  assessmentId?: string | null;
}
export interface PipelineTemplate {
  id: string;
  name: string;
  stages: PipelineTemplateStage[];
  isDefault: boolean;
  usedBy: number;
}
interface Draft {
  id?: string;
  name: string;
  stages: StageDraft[];
  isDefault: boolean;
}

const starter = () =>
  [
    { name: 'New', type: 'Applied' },
    { name: 'Screen', type: 'Screen' },
    { name: 'Interview', type: 'Interview' },
    { name: 'Offer', type: 'Offer' },
  ].map(toDraft);

const usedByText = (count: number) =>
  count === 0 ? 'Not used yet' : count === 1 ? 'Used by 1 job' : `Used by ${count} jobs`;

export function PipelineTemplatesSection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PipelineTemplate | null>(null);
  const assessments = useStageAssessments(draft !== null);
  const templates = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
  });
  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-templates'] });
    toast.success(message);
  };
  const save = useMutation({
    mutationFn: ({ value }: { value: Draft; message: string }) => {
      const body = {
        name: value.name.trim(),
        stages: value.stages.map(fromDraft),
        isDefault: value.isDefault,
      };
      return value.id
        ? api.put(`/api/admin/pipeline-templates/${value.id}`, body)
        : api.post('/api/admin/pipeline-templates', body);
    },
    onSuccess: (_result, { message }) => {
      done(message);
      setDraft(null);
    },
    onError: (error: Error) => toast.error('Could not save the pipeline', error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/pipeline-templates/${id}`),
    onSuccess: () => done('Pipeline deleted'),
    onError: (error: Error) => toast.error('Could not delete the pipeline', error.message),
  });

  const fromTemplate = (template: PipelineTemplate): Draft => ({
    id: template.id,
    name: template.name,
    isDefault: template.isDefault,
    stages: template.stages.map(toDraft),
  });
  const copyName = (name: string) => {
    const taken = new Set(templates.data?.map((t) => t.name.toLowerCase()));
    let candidate = `${name} (copy)`;
    for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${name} (copy ${i})`;
    return candidate;
  };
  const problem = draft
    ? !draft.name.trim()
      ? 'Give the pipeline a name.'
      : stageListProblem(draft.stages, 12)
    : null;

  return (
    <>
      <SettingsHeader
        actions={
          <Button
            leftIcon={<Plus />}
            onClick={() => setDraft({ name: '', stages: starter(), isDefault: false })}
          >
            Add pipeline
          </Button>
        }
      />
      <Card>
        <CardBody>
          {!templates.data ? (
            <SkeletonRows rows={2} className="p-0" />
          ) : templates.data.length === 0 ? (
            <EmptyState
              compact
              icon={GitBranch}
              title="No pipelines yet"
              description="Add one so new jobs start with the stages your team actually uses."
            />
          ) : (
            <ul className="-my-2 divide-y divide-border-subtle">
              {templates.data.map((template) => (
                <li key={template.id} className="flex flex-wrap items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 basis-72">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="font-medium text-fg hover:text-accent-foreground hover:underline"
                        onClick={() => setDraft(fromTemplate(template))}
                      >
                        {template.name}
                      </button>
                      {template.isDefault && <Badge tone="blue">Default</Badge>}
                      <span className="text-xs text-fg-subtle">{usedByText(template.usedBy)}</span>
                    </div>
                    <ol
                      className="mt-2 flex flex-wrap items-center gap-1"
                      aria-label={`${template.name} stages`}
                    >
                      {[...template.stages, { id: 'hired', name: 'Hired', type: 'Hired' }].map(
                        (stage, i) => (
                          <li key={stage.id} className="flex items-center gap-1">
                            {i > 0 && (
                              <ChevronRight className="size-3 text-fg-subtle" aria-hidden />
                            )}
                            <StageBadge stage={stage.name} type={stage.type} size="sm" />
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                  <RowActions label={`Actions for ${template.name}`}>
                    <MenuItem icon={<PenLine />} onSelect={() => setDraft(fromTemplate(template))}>
                      Edit
                    </MenuItem>
                    {!template.isDefault && (
                      <MenuItem
                        icon={<Star />}
                        onSelect={() =>
                          save.mutate({
                            value: { ...fromTemplate(template), isDefault: true },
                            message: `${template.name} is now the default`,
                          })
                        }
                      >
                        Make default
                      </MenuItem>
                    )}
                    <MenuItem
                      icon={<Copy />}
                      onSelect={() =>
                        setDraft({
                          ...fromTemplate(template),
                          id: undefined,
                          name: copyName(template.name),
                          isDefault: false,
                        })
                      }
                    >
                      Duplicate
                    </MenuItem>
                    <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(template)}>
                      Delete
                    </MenuItem>
                  </RowActions>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        opened={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit pipeline' : 'New pipeline'}
        description="Drag a stage by its handle to change the order. The type sets the colour and what happens automatically."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!!problem}
              loading={save.isPending}
              onClick={() => draft && save.mutate({ value: draft, message: 'Pipeline saved' })}
            >
              Save pipeline
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <Input
              inset
              label="Name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              autoFocus
            />
            <div>
              <Label>Stages, in order</Label>
              <div className="mt-2">
                <StageListEditor
                  stages={draft.stages}
                  onChange={(stages) => setDraft({ ...draft, stages })}
                  max={12}
                  assessments={assessments}
                  after={<span className="text-xs text-fg-subtle">Then Hired, added for you</span>}
                />
              </div>
              {problem && draft.name.trim() && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {problem}
                </p>
              )}
            </div>
            {draft.id && (templates.data?.find((t) => t.id === draft.id)?.usedBy ?? 0) > 0 && (
              <p className="text-sm text-fg-muted">
                Jobs already using this pipeline keep their own stages. Change a job’s stages from
                its Pipeline tab.
              </p>
            )}
            <Checkbox
              label="Use as the default for new jobs"
              checked={draft.isDefault}
              onCheckedChange={(isDefault) => setDraft({ ...draft, isDefault })}
            />
          </div>
        )}
      </Modal>
      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this pipeline?"
        message={`“${removing?.name ?? ''}” won’t be offered for new jobs. Jobs already using it keep their stages.`}
        confirmLabel="Delete pipeline"
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id).catch(() => undefined);
        }}
      />
    </>
  );
}
