'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GitBranch,
  GripVertical,
  PenLine,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '@/api';
import { StageBadge } from '@/components/status';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Label,
  MenuItem,
  Modal,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { SettingsSection } from './settings-shared';

interface PipelineTemplate {
  id: string;
  name: string;
  stageNames: string[];
  isDefault: boolean;
}
interface Draft {
  id?: string;
  name: string;
  stageNames: string[];
  isDefault: boolean;
}

export function PipelineTemplatesSection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PipelineTemplate | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const templates = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
  });
  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-templates'] });
    toast.success(message);
  };
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = {
        name: value.name.trim(),
        stageNames: value.stageNames.map((x) => x.trim()).filter(Boolean),
        isDefault: value.isDefault,
      };
      return value.id
        ? api.put(`/api/admin/pipeline-templates/${value.id}`, body)
        : api.post('/api/admin/pipeline-templates', body);
    },
    onSuccess: () => {
      done('Pipeline saved');
      setDraft(null);
    },
    onError: (error: Error) => toast.error('Could not save the pipeline', error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/pipeline-templates/${id}`),
    onSuccess: () => done('Pipeline deleted'),
    onError: (error: Error) => toast.error('Could not delete', error.message),
  });

  const moveTo = (from: number, to: number) => {
    if (!draft || from === to) return;
    const stages = [...draft.stageNames];
    stages.splice(to, 0, ...stages.splice(from, 1));
    setDraft({ ...draft, stageNames: stages });
  };
  const move = (index: number, by: number) => moveTo(index, index + by);
  const names = draft?.stageNames.map((x) => x.trim()).filter(Boolean) ?? [];
  const valid =
    !!draft?.name.trim() &&
    names.length >= 1 &&
    names.length <= 12 &&
    new Set(names.map((x) => x.toLowerCase())).size === names.length;
  const addNew = () =>
    setDraft({
      name: '',
      stageNames: ['Applied', 'Screen', 'Interview', 'Offer'],
      isDefault: false,
    });

  return (
    <SettingsSection
      id="pipelines"
      title="Pipelines"
      description="Hired is always the last stage and is added for you."
      action={
        <Button leftIcon={<Plus />} onClick={addNew}>
          Add pipeline
        </Button>
      }
    >
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
        <ul className="-my-4 divide-y divide-border-subtle">
          {templates.data.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-0 flex-1 basis-72">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-fg">{template.name}</p>
                  {template.isDefault && <Badge tone="blue">Default</Badge>}
                </div>
                <ol
                  className="mt-2 flex flex-wrap items-center gap-1"
                  aria-label={`${template.name} stages`}
                >
                  {[...template.stageNames, 'Hired'].map((stage, i) => (
                    <li key={`${stage}-${i}`} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="size-3 text-fg-subtle" aria-hidden />}
                      <StageBadge stage={stage} size="sm" />
                    </li>
                  ))}
                </ol>
              </div>
              <RowActions label={`Actions for ${template.name}`}>
                <MenuItem icon={<PenLine />} onSelect={() => setDraft({ ...template })}>
                  Edit
                </MenuItem>
                <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(template)}>
                  Delete
                </MenuItem>
              </RowActions>
            </li>
          ))}
        </ul>
      )}

      <Modal
        opened={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit pipeline' : 'New pipeline'}
        description="Drag the handles or use the arrows to change the order."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              loading={save.isPending}
              onClick={() => draft && save.mutate(draft)}
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
              <div className="mt-2 flex flex-col gap-1.5">
                {draft.stageNames.map((stage, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-1 rounded-md',
                      drag?.over === index && drag.from !== index && 'bg-accent',
                      drag?.from === index && 'opacity-50',
                    )}
                    onDragOver={(event) => {
                      if (!drag) return;
                      event.preventDefault();
                      if (drag.over !== index) setDrag({ ...drag, over: index });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (drag) moveTo(drag.from, index);
                      setDrag(null);
                    }}
                  >
                    {/* Drag by the handle; the arrow buttons do the same from the keyboard. */}
                    <span
                      draggable
                      aria-hidden
                      title="Drag to reorder"
                      className="flex cursor-grab items-center text-fg-subtle hover:text-fg active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', String(index));
                        const row = event.currentTarget.parentElement;
                        if (row) event.dataTransfer.setDragImage(row, 12, row.offsetHeight / 2);
                        setDrag({ from: index, over: index });
                      }}
                      onDragEnd={() => setDrag(null)}
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span className="w-5 shrink-0 text-right text-xs text-fg-subtle tnum">
                      {index + 1}
                    </span>
                    <Input
                      aria-label={`Stage ${index + 1}`}
                      value={stage}
                      className="flex-1"
                      onChange={(event) => {
                        const stages = [...draft.stageNames];
                        stages[index] = event.currentTarget.value;
                        setDraft({ ...draft, stageNames: stages });
                      }}
                    />
                    <IconButton
                      variant="quiet"
                      size="sm"
                      label={`Move stage ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      variant="quiet"
                      size="sm"
                      label={`Move stage ${index + 1} down`}
                      disabled={index === draft.stageNames.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      variant="danger-quiet"
                      size="sm"
                      label={`Remove stage ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          stageNames: draft.stageNames.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pl-6">
                  <Button
                    variant="quiet"
                    size="sm"
                    leftIcon={<Plus />}
                    disabled={draft.stageNames.length >= 12}
                    onClick={() => setDraft({ ...draft, stageNames: [...draft.stageNames, ''] })}
                  >
                    Add stage
                  </Button>
                  <span className="text-xs text-fg-subtle">Then Hired, added for you</span>
                </div>
              </div>
              {names.length > 0 && (
                <div className="mt-3 rounded-lg bg-muted px-3 py-2.5">
                  <p className="text-xs text-fg-subtle">New jobs start with</p>
                  <ol
                    className="mt-1.5 flex flex-wrap items-center gap-1"
                    aria-label="Stage preview"
                  >
                    {[...names, 'Hired'].map((stage, i) => (
                      <li key={`${stage}-${i}`} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="size-3 text-fg-subtle" aria-hidden />}
                        <StageBadge stage={stage} size="sm" />
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {!valid && draft.name.trim() && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  Use one to twelve stages, each with a different name.
                </p>
              )}
            </div>
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
    </SettingsSection>
  );
}
