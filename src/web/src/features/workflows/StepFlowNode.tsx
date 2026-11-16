'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Check, CircleSlash, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, SearchInput } from '@/components/ui';
import { StepCard, StepIcon, type StepTone } from '@/components/workflow/StepNode';
import { cn } from '@/lib/cn';
import {
  eyebrowOf,
  GROUPS,
  GROUP_LABELS,
  STEPS,
  defOf,
  isTrigger,
  outputLabel,
  outputsOf,
  titleOf,
  type Group,
} from './catalog';
import type { Lookups, Values } from './workflow-api';

export type StepData = { kind: string; values: Values };
export type StepNode = Node<StepData, 'step'>;
export type FlowEdge = Edge<{ label?: string }>;

export const toneOf = (group: Group): StepTone =>
  group === 'Triggers' ? 'trigger' : group === 'Logic' ? 'logic' : 'action';

/** What the canvas needs that is not part of the saved graph. */
export type CanvasState = {
  lookups: Lookups | undefined;
  readOnly: boolean;
  problems: Set<string>;
  /** Test run: the steps it passed, the one it is showing, and each step's outcome. */
  visited: Set<string> | null;
  active: string | null;
  outcomes: Record<string, 'Done' | 'Skipped' | 'Waiting' | 'Failed'>;
  pathEdges: Set<string>;
  /** Outputs of a step with nothing after them. */
  openOutputs: (nodeId: string) => (string | null)[];
  addAfter: (source: string, handle: string | null, kind: string) => void;
  insertOn: (edgeId: string, kind: string) => void;
};
export const Canvas = createContext<CanvasState | null>(null);
const useCanvas = () => useContext(Canvas)!;

// Handles show while you point at a step (to drag a new connection), not as dots on every line.
const handle =
  'size-2.5! border-2! border-primary! bg-card! min-w-0! min-h-0! opacity-0 transition-opacity [.react-flow__node:hover_&]:opacity-100 [.react-flow__node.selected_&]:opacity-100 [.connecting_&]:opacity-100';

/** A step on the canvas: the step card with a handle on top and one per output along the bottom. */
export function StepFlowNode({ id, data, selected }: NodeProps<StepNode>) {
  const canvas = useCanvas();
  const def = defOf(data.kind);
  const outputs = outputsOf(data);
  const open = canvas.openOutputs(id);
  const trigger = isTrigger(data.kind);
  const outcome = canvas.outcomes[id];
  const state = canvas.problems.has(id)
    ? 'problem'
    : canvas.active === id
      ? 'active'
      : canvas.visited
        ? canvas.visited.has(id)
          ? 'passed'
          : 'dimmed'
        : undefined;
  return (
    <div className="relative">
      <StepCard
        icon={def.icon}
        tone={toneOf(def.group)}
        eyebrow={eyebrowOf(def)}
        title={titleOf(data)}
        summary={def.summary(data.values, canvas.lookups)}
        selected={selected}
        state={state}
        badge={outcome && <OutcomeMark outcome={outcome} />}
        footer={
          outputs &&
          outputs.map((o) => (
            <div
              key={o.id}
              className="relative flex-1 truncate px-2 py-1.5 text-center not-last:border-r not-last:border-border-subtle"
            >
              {o.label}
              <Handle type="source" position={Position.Bottom} id={o.id} className={handle} />
            </div>
          ))
        }
      >
        {!trigger && <Handle type="target" position={Position.Top} className={handle} />}
        {!outputs && <Handle type="source" position={Position.Bottom} className={handle} />}
      </StepCard>
      {!canvas.readOnly && open.length > 0 && (
        <div className="absolute inset-x-0 top-full flex pt-3">
          {(outputs ?? [{ id: null as string | null, label: '' }]).map((o) => (
            <div key={o.id ?? 'out'} className="flex flex-1 justify-center">
              {open.includes(o.id) && (
                <AddStepButton
                  label={
                    o.label ? `Add a step to the ${o.label} path` : 'Add a step after this one'
                  }
                  onPick={(kind) => canvas.addAfter(id, o.id, kind)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeMark({ outcome }: { outcome: string }) {
  const map = {
    Done: ['bg-tone-green-bg text-tone-green-fg', <Check key="i" />, 'Done'],
    Skipped: ['bg-tone-gray-bg text-tone-gray-fg', <CircleSlash key="i" />, 'Skipped'],
    Waiting: ['bg-tone-violet-bg text-tone-violet-fg', <Check key="i" />, 'Would wait'],
    Failed: ['bg-tone-red-bg text-tone-red-fg', <X key="i" />, 'Failed'],
  } as const;
  const [tone, icon, label] = map[outcome as keyof typeof map] ?? map.Done;
  return (
    <span
      className={cn('flex size-5 items-center justify-center rounded-full [&_svg]:size-3', tone)}
      aria-label={label}
      title={label}
    >
      {icon}
    </span>
  );
}

/** A connector with its path label and a "+" in the middle to put a step there. */
export function PlusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<FlowEdge>) {
  const canvas = useCanvas();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const onPath = canvas.pathEdges.has(id);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: onPath || selected ? 'var(--primary)' : 'var(--fg-subtle)',
          strokeWidth: onPath ? 2.5 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          style={{ transform: `translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label && (
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-fg-muted">
              {data.label}
            </span>
          )}
          {!canvas.readOnly && (
            <AddStepButton
              label="Add a step here"
              onPick={(kind) => canvas.insertOn(id, kind)}
              small
            />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const nodeTypes = { step: StepFlowNode };
export const edgeTypes = { plus: PlusEdge };

/** The round "+" that opens the step menu. */
export function AddStepButton({
  label,
  onPick,
  triggers,
  small,
  children,
}: {
  label: string;
  onPick: (kind: string) => void;
  triggers?: boolean;
  small?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label={label}
            title={label}
            className={cn(
              'nodrag flex items-center justify-center rounded-full border border-border bg-card text-fg-muted shadow-card transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              small ? 'size-6 [&_svg]:size-3.5' : 'size-7 [&_svg]:size-4',
            )}
          >
            <Plus aria-hidden />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="center">
        <StepMenu
          triggers={triggers}
          onPick={(kind) => {
            setOpen(false);
            onPick(kind);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Searchable list of steps, grouped, with one line of help under each. */
export function StepMenu({
  triggers,
  onPick,
}: {
  triggers?: boolean;
  onPick: (kind: string) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.filter((g) => (triggers ? g === 'Triggers' : g !== 'Triggers'))
      .map((g) => ({
        group: g,
        steps: STEPS.filter(
          (s) => s.group === g && (!q || `${s.label} ${s.help}`.toLowerCase().includes(q)),
        ),
      }))
      .filter((x) => x.steps.length);
  }, [query, triggers]);
  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      <div className="border-b border-border-subtle p-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={triggers ? 'Search what starts it' : 'Search steps'}
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">No steps match.</p>
        )}
        {groups.map(({ group, steps }) => (
          <div key={group} className="mb-1">
            <p className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              {GROUP_LABELS[group]}
            </p>
            {steps.map((s) => (
              <button
                key={s.kind}
                type="button"
                onClick={() => onPick(s.kind)}
                className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <StepIcon icon={s.icon} tone={toneOf(s.group)} className="size-7" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{s.label}</span>
                  <span className="block text-2xs leading-snug text-fg-subtle">{s.help}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { outputLabel };
