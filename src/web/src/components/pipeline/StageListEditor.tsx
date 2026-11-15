'use client';

import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, NumberInput, Select, toneDot } from '@/components/ui';
import { stageTone, stageTypes, type StageType } from '@/components/status';
import { cn } from '@/lib/cn';

export type StageEmailSetting = 'Off' | 'Ask' | 'Always';

/** One stage while it is being edited. `key` stays the same while the row moves. */
export type StageDraft = {
  key: string;
  id?: string;
  name: string;
  type: StageType;
  candidateLabel: string;
  emailOnEntry: StageEmailSetting;
  targetDays: number | '';
  /** The assessment this stage uses; its score shows on the cards in the stage. */
  assessmentId: string | null;
};

/** What candidates see when a stage has no label of its own (the server's `StageRules.DefaultLabel`). */
export const defaultCandidateLabel: Record<StageType, string> = {
  Applied: 'Application received',
  Screen: 'Under review',
  Interview: 'Interviewing',
  Offer: 'Offer',
  Hired: 'Hired',
  Other: 'In progress',
};

const emailOptions = [
  { value: 'Off', label: 'Don’t email' },
  { value: 'Ask', label: 'Ask each time' },
  { value: 'Always', label: 'Always email' },
];

let nextKey = 0;
export const newStageKey = () => `new-${++nextKey}`;

/** A server stage (job or pipeline) as a draft row. */
export function toDraft(stage: {
  id?: string;
  name: string;
  type?: string;
  candidateLabel?: string;
  emailOnEntry?: string;
  targetDays?: number | null;
  assessmentId?: string | null;
}): StageDraft {
  const type = (stageTypes.some((t) => t.value === stage.type) ? stage.type : 'Other') as StageType;
  return {
    key: stage.id ?? newStageKey(),
    id: stage.id,
    name: stage.name,
    type,
    candidateLabel: stage.candidateLabel || defaultCandidateLabel[type],
    emailOnEntry: (stage.emailOnEntry as StageEmailSetting) ?? 'Off',
    targetDays: stage.targetDays ?? '',
    assessmentId: stage.assessmentId ?? null,
  };
}

/** The draft as the API takes it (`StageInput`). */
export const fromDraft = (stage: StageDraft) => ({
  id: stage.id ?? null,
  name: stage.name.trim(),
  type: stage.type,
  candidateLabel: stage.candidateLabel.trim() || null,
  emailOnEntry: stage.emailOnEntry,
  targetDays: stage.targetDays === '' ? null : stage.targetDays,
  assessmentId: stage.assessmentId,
});

/** The first problem with a stage list, or null. Same rules as the server. */
export function stageListProblem(stages: StageDraft[], max: number) {
  const names = stages.map((s) => s.name.trim().toLowerCase());
  if (stages.length < 1 || stages.length > max) return `Use one to ${max} stages.`;
  if (names.some((n) => !n)) return 'Give every stage a name.';
  if (new Set(names).size !== names.length) return 'Give each stage a different name.';
  if (stages.some((s) => s.targetDays !== '' && (s.targetDays < 1 || s.targetDays > 365)))
    return 'Target days must be between 1 and 365.';
  return null;
}

/**
 * The stages of a pipeline or a job, in order: drag the handle (mouse, touch, or Space and the
 * arrow keys) to reorder. Each stage has a name, a type that sets its colour and automation, what
 * candidates see, whether entering it emails them, and a target number of days.
 * Hired is not in the list; pass it (or a note about it) as `after`.
 */
export function StageListEditor({
  stages,
  onChange,
  max,
  after,
  assessments,
}: {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
  max: number;
  /** Shown under the rows, next to "Add stage". */
  after?: ReactNode;
  /** Assessments a stage can use. Without any, the field is hidden. */
  assessments?: { value: string; label: string }[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const update = (key: string, patch: Partial<StageDraft>) =>
    onChange(stages.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = stages.findIndex((s) => s.key === active.id);
    const to = stages.findIndex((s) => s.key === over.id);
    onChange(arrayMove(stages, from, to));
  };
  const nameOf = (key: string | number) => stages.find((s) => s.key === key)?.name || 'the stage';

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        id="stage-list"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${nameOf(active.id)} is now at position ${stages.findIndex((s) => s.key === over.id) + 1} of ${stages.length}.`
                : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? `${nameOf(active.id)} dropped at position ${stages.findIndex((s) => s.key === over.id) + 1}.`
                : `${nameOf(active.id)} dropped.`,
            onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
          },
        }}
      >
        <SortableContext items={stages.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {stages.map((stage, index) => (
              <StageRow
                key={stage.key}
                stage={stage}
                index={index}
                assessments={assessments}
                onChange={(patch) => update(stage.key, patch)}
                onRemove={
                  stages.length > 1
                    ? () => onChange(stages.filter((s) => s.key !== stage.key))
                    : undefined
                }
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap items-center justify-between gap-2 pl-1">
        <Button
          variant="quiet"
          size="sm"
          leftIcon={<Plus />}
          disabled={stages.length >= max}
          onClick={() =>
            onChange([
              ...stages,
              {
                key: newStageKey(),
                name: '',
                type: 'Other',
                candidateLabel: defaultCandidateLabel.Other,
                emailOnEntry: 'Off',
                targetDays: '',
                assessmentId: null,
              },
            ])
          }
        >
          Add stage
        </Button>
        {after}
      </div>
    </div>
  );
}

function StageRow({
  stage,
  index,
  assessments,
  onChange,
  onRemove,
}: {
  stage: StageDraft;
  index: number;
  assessments?: { value: string; label: string }[];
  onChange: (patch: Partial<StageDraft>) => void;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.key });
  const n = index + 1;
  const label = stage.name.trim() || `stage ${n}`;
  return (
    <li
      ref={setNodeRef}
      // Dynamic position while dragging.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-border-subtle bg-card p-2.5',
        isDragging && 'relative z-10 shadow-pop',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${label}. Press Space, then the arrow keys.`}
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-subtle hover:bg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', toneDot(stageTone(stage.type)))}
        />
        <Input
          aria-label={`Name of stage ${n}`}
          placeholder="Stage name"
          value={stage.name}
          className="min-w-0 flex-1"
          onChange={(e) => onChange({ name: e.currentTarget.value })}
        />
        <Select
          aria-label={`Type of ${label}`}
          className="w-36 shrink-0"
          value={stage.type}
          data={stageTypes
            .filter((t) => t.value !== 'Hired')
            .map((t) => ({ value: t.value, label: t.label }))}
          onChange={(value) => {
            if (!value) return;
            const type = value as StageType;
            // Keep a label someone wrote; follow the type when it is still the default.
            const followsType =
              !stage.candidateLabel.trim() ||
              stage.candidateLabel === defaultCandidateLabel[stage.type];
            onChange({
              type,
              candidateLabel: followsType ? defaultCandidateLabel[type] : stage.candidateLabel,
            });
          }}
        />
        {onRemove && (
          <IconButton variant="danger-quiet" size="sm" label={`Remove ${label}`} onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:ml-10 sm:grid-cols-[minmax(0,1fr)_170px_120px]">
        <Input
          inset
          label="Candidates see"
          value={stage.candidateLabel}
          maxLength={80}
          onChange={(e) => onChange({ candidateLabel: e.currentTarget.value })}
        />
        <Select
          inset
          label="Email when they arrive"
          value={stage.emailOnEntry}
          data={emailOptions}
          onChange={(value) => value && onChange({ emailOnEntry: value as StageEmailSetting })}
        />
        <NumberInput
          inset
          label="Target days"
          min={1}
          max={365}
          value={stage.targetDays}
          onValueChange={(targetDays) => onChange({ targetDays })}
        />
        {(assessments?.length || stage.assessmentId) && (
          <Select
            inset
            clearable
            className="sm:col-span-3"
            label="Assessment"
            placeholder="None"
            value={stage.assessmentId}
            data={
              assessments?.some((a) => a.value === stage.assessmentId) || !stage.assessmentId
                ? (assessments ?? [])
                : [
                    ...(assessments ?? []),
                    { value: stage.assessmentId, label: 'An archived assessment' },
                  ]
            }
            onChange={(assessmentId) => onChange({ assessmentId })}
          />
        )}
      </div>
    </li>
  );
}
