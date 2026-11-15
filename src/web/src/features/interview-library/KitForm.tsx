'use client';

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  Library,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAbility } from '@/lib/ability';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import {
  Button,
  Input,
  MenuItem,
  MenuSeparator,
  NumberInput,
  RowActions,
  Select,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSaveQuestion } from './library-data';
import {
  blankCompetency,
  competencyFromQuestion,
  move,
  type CompetencyErrors,
  type KitCompetency,
  type KitDraft,
  type KitErrors,
} from './library-model';
import { QuestionBankPanel } from './QuestionBankPanel';

const WEIGHTS = [
  { value: '1', label: '1 · Low' },
  { value: '2', label: '2' },
  { value: '3', label: '3 · Normal' },
  { value: '4', label: '4' },
  { value: '5', label: '5 · High' },
];

/**
 * The body of an interview kit, used for a job's kits and for library templates: a name and
 * length, instructions for interviewers, and structured competency blocks. Each block keeps its
 * competency id, so renaming or reordering never loses its scores.
 */
export function KitForm({
  draft,
  onChange,
  errors,
  stages,
  header,
}: {
  draft: KitDraft;
  onChange: (draft: KitDraft) => void;
  /** Shown after the first save attempt. */
  errors: KitErrors | null;
  /** The job's stages, for "which stage is this kit for". Left out for templates. */
  stages?: Array<{ value: string; label: string }>;
  /** Shown above the name, for example a version notice. */
  header?: ReactNode;
}) {
  const [bankOpen, setBankOpen] = useState(false);
  const set = (patch: Partial<KitDraft>) => onChange({ ...draft, ...patch });
  const setCriteria = (criteria: KitCompetency[]) => set({ criteria });
  const update = (key: string, patch: Partial<KitCompetency>) =>
    setCriteria(draft.criteria.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = draft.criteria.map((item) => item.key);
    setCriteria(
      move(draft.criteria, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))),
    );
  };
  const names = new Set(draft.criteria.map((item) => item.name.trim().toLowerCase()));
  const totalWeight = draft.criteria.reduce((sum, item) => sum + item.weight, 0);

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] lg:grid-cols-[minmax(0,1fr)_8rem_14rem]">
          <Input
            label="Kit name"
            placeholder="For example Hiring manager interview"
            value={draft.name}
            onChange={(event) => set({ name: event.currentTarget.value })}
            error={errors?.name}
            maxLength={120}
            inputClassName="font-medium"
            className="sm:col-span-2 lg:col-span-1"
          />
          <NumberInput
            label="Length"
            min={15}
            max={480}
            step={15}
            rightSection="min"
            value={draft.durationMinutes}
            onValueChange={(value) => set({ durationMinutes: value })}
            error={errors?.duration}
          />
          {stages && (
            <Select
              label="Stage"
              placeholder="Any stage"
              clearable
              data={stages}
              value={draft.pipelineStageId}
              onChange={(value) => set({ pipelineStageId: value })}
            />
          )}
        </div>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="kit-instructions">
        <div>
          <h2 id="kit-instructions" className="text-lg font-semibold text-fg">
            Instructions for interviewers
          </h2>
          <p className="text-sm text-fg-subtle">
            What this round is for, how to run it, and what to listen for.
          </p>
        </div>
        <PlateMarkdownEditor
          value={draft.instructions}
          onChange={(instructions) => set({ instructions })}
          placeholder="For example: spend most of the time on one recent project. Ask what the candidate did, not the team."
          invalid={!!errors?.instructions}
        />
        {errors?.instructions && (
          <p role="alert" className="text-sm text-destructive">
            {errors.instructions}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="kit-competencies">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="kit-competencies" className="text-lg font-semibold text-fg">
              Competencies
            </h2>
            <p className="text-sm text-fg-subtle">
              Interviewers score each one from 1 to 5. Drag to change the order.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Library />}
            onClick={() => setBankOpen(true)}
          >
            Add from question bank
          </Button>
        </div>
        {errors?.criteria && (
          <p role="alert" className="text-sm text-destructive">
            {errors.criteria}
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={draft.criteria.map((item) => item.key)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-3">
              {draft.criteria.map((item, index) => (
                <CompetencyBlock
                  key={item.key}
                  item={item}
                  index={index}
                  count={draft.criteria.length}
                  share={totalWeight ? Math.round((item.weight / totalWeight) * 100) : 0}
                  errors={errors?.items[item.key]}
                  onChange={(patch) => update(item.key, patch)}
                  onMove={(to) => setCriteria(move(draft.criteria, index, to))}
                  onRemove={() =>
                    setCriteria(draft.criteria.filter((other) => other.key !== item.key))
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <Button
          variant="soft"
          leftIcon={<Plus />}
          className="self-start"
          onClick={() => setCriteria([...draft.criteria, blankCompetency()])}
        >
          Add competency
        </Button>
      </section>

      <QuestionBankPanel
        opened={bankOpen}
        onClose={() => setBankOpen(false)}
        namesInKit={names}
        onInsert={(question) =>
          setCriteria([
            // A blank block nobody has typed in yet is replaced, not left above the new one.
            ...draft.criteria.filter((item) => item.name || item.question),
            competencyFromQuestion(question),
          ])
        }
      />
    </div>
  );
}

function CompetencyBlock({
  item,
  index,
  count,
  share,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  item: KitCompetency;
  index: number;
  count: number;
  /** This competency's part of the weighted score, in percent. */
  share: number;
  errors?: CompetencyErrors;
  onChange: (patch: Partial<KitCompetency>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const ability = useAbility();
  const save = useSaveQuestion();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });
  const label = item.name.trim() || `Competency ${index + 1}`;

  return (
    <li
      ref={setNodeRef}
      // Dynamic: where the block is while it is being dragged.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-xl border bg-card p-4 sm:p-5',
        errors ? 'border-destructive/50' : 'border-border',
        isDragging && 'relative z-10 shadow-pop',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag to move ${label}`}
          className="mt-2 -ml-1 shrink-0 cursor-grab rounded-md p-1 text-fg-subtle hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_9.5rem]">
          <Input
            aria-label={`Name of competency ${index + 1}`}
            placeholder="Competency, for example Problem solving"
            value={item.name}
            maxLength={120}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
            error={errors?.name}
            inputClassName="font-medium"
          />
          <Select
            aria-label={`Weight of ${label}`}
            data={WEIGHTS}
            value={String(item.weight)}
            onChange={(value) => value && onChange({ weight: Number(value) })}
          />
        </div>
        <RowActions label={`Actions for ${label}`}>
          <MenuItem icon={<ArrowUp />} disabled={index === 0} onSelect={() => onMove(index - 1)}>
            Move up
          </MenuItem>
          <MenuItem
            icon={<ArrowDown />}
            disabled={index === count - 1}
            onSelect={() => onMove(index + 1)}
          >
            Move down
          </MenuItem>
          {ability.can('manage', 'InterviewKit') && (
            <MenuItem
              icon={<BookmarkPlus />}
              disabled={!item.name.trim() || !item.question.trim()}
              onSelect={() =>
                save.mutate({
                  name: item.name.trim(),
                  question: item.question.trim(),
                  followUps: item.followUps.trim(),
                  goodLooksLike: item.description.trim(),
                  weight: item.weight,
                  tags: [],
                })
              }
            >
              Save to question bank
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onRemove}>
            Remove
          </MenuItem>
        </RowActions>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:pl-7">
        <Textarea
          label="Question to ask"
          minRows={2}
          maxLength={1000}
          value={item.question}
          onChange={(event) => onChange({ question: event.currentTarget.value })}
          error={errors?.question}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Textarea
            label="Follow-ups"
            description="Optional. Prompts to get specifics."
            minRows={2}
            maxLength={2000}
            value={item.followUps}
            onChange={(event) => onChange({ followUps: event.currentTarget.value })}
            error={errors?.followUps}
          />
          <Textarea
            label="What a good answer shows"
            description="Optional. What interviewers listen for."
            minRows={2}
            maxLength={2000}
            value={item.description}
            onChange={(event) => onChange({ description: event.currentTarget.value })}
          />
        </div>
        <p className="text-xs text-fg-subtle tnum">{share}% of the overall score</p>
      </div>
    </li>
  );
}
