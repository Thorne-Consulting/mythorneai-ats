'use client';

import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import {
  AlertTriangle,
  ArrowLeft,
  FlaskConical,
  History,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Undo2,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  IconButton,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { PreviewAlert } from '../preview-ui';
import {
  GROUPS,
  Highlights,
  STEPS,
  StepIcon,
  defOf,
  nodeTypes,
  outputsOf,
  splitValues,
  titleOf,
  type StepNode,
  type Values,
} from './catalog';
import { compare, layout, runPath, validate } from './graph';
import { EdgeInspector, StepInspector } from './Inspector';
import {
  MAX_VERSIONS,
  SAMPLE_CANDIDATES,
  statusTone,
  toGraph,
  uid,
  useWorkflows,
  type Workflow,
} from './sample-workflows';

/** Route entry: waits for the browser copy, then mounts the editor for one workflow. */
export function WorkflowEditorPage({ id }: { id: string }) {
  const { workflows, ready, update } = useWorkflows();
  if (!ready) return <SkeletonRows rows={6} />;
  const workflow = workflows.find((w) => w.id === id);
  if (!workflow)
    return (
      <Card>
        <EmptyState
          icon={WorkflowIcon}
          title="Workflow not found"
          description="It may have been deleted, or it was created in another browser."
          action={
            <Button asChild>
              <Link href="/admin/workflows">Back to workflows</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <ReactFlowProvider>
      <Editor
        key={id}
        workflow={workflow}
        onPatch={(patch) => update((all) => all.map((w) => (w.id === id ? { ...w, ...patch } : w)))}
      />
    </ReactFlowProvider>
  );
}

type Snapshot = { name: string; nodes: StepNode[]; edges: Edge[] };
type PanelMode = 'inspect' | 'problems' | 'test';
const DRAG_TYPE = 'application/x-workflow-step';

// What gets saved: no selection, measurements or drag state.
const cleanNodes = (ns: StepNode[]): StepNode[] =>
  ns.map(({ id, position, data }) => ({ id, type: 'step', position, data }));
const cleanEdges = (es: Edge[]): Edge[] =>
  es.map(({ id, source, target, sourceHandle, label }) => ({
    id,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    label,
  }));
const same = (a: Snapshot, b: Snapshot) =>
  a.name === b.name &&
  JSON.stringify(cleanNodes(a.nodes)) === JSON.stringify(cleanNodes(b.nodes)) &&
  JSON.stringify(cleanEdges(a.edges)) === JSON.stringify(cleanEdges(b.edges));
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function Editor({
  workflow,
  onPatch,
}: {
  workflow: Workflow;
  onPatch: (patch: Partial<Workflow>) => void;
}) {
  const flow = useReactFlow<StepNode, Edge>();
  const canvas = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(workflow.name);
  const [nodes, setNodes] = useState<StepNode[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);
  const [panel, setPanel] = useState<PanelMode>('inspect');

  // Undo/redo: snapshots taken before each change. Typing in one field coalesces into one entry.
  const current = useRef<Snapshot>({ name, nodes, edges });
  current.current = { name, nodes, edges };
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastKey = useRef<string | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const record = (key?: string) => {
    if (key && key === lastKey.current) return;
    lastKey.current = key ?? null;
    past.current = [...past.current.slice(-99), current.current];
    future.current = [];
    rerender();
  };
  const restore = (s: Snapshot) => {
    setName(s.name);
    setNodes(s.nodes);
    setEdges(s.edges);
    lastKey.current = null;
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(current.current);
    restore(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    restore(next);
  };

  const saved: Snapshot = { name: workflow.name, nodes: workflow.nodes, edges: workflow.edges };
  const dirty = !same({ name, nodes, edges }, saved);
  const graph = useMemo(() => toGraph(nodes), [nodes]);
  const problems = useMemo(() => validate(graph, edges), [graph, edges]);
  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = selectedNode ? undefined : edges.find((e) => e.selected);
  const titleById = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n ? titleOf(n.data) : 'Unknown step';
  };

  const save = () => {
    if (!dirty) return;
    if (!name.trim()) return toast.error('Give the workflow a name before saving.');
    if (workflow.status === 'Active' && problems.length) {
      setPanel('problems');
      return toast.error(
        'Fix the problems first',
        'An active workflow must be valid. Pause it to save a draft.',
      );
    }
    const now = new Date().toISOString();
    const snap = { name: name.trim(), nodes: cleanNodes(nodes), edges: cleanEdges(edges) };
    onPatch({
      ...snap,
      updatedAt: now,
      versions: [{ id: uid(), savedAt: now, ...snap }, ...workflow.versions].slice(0, MAX_VERSIONS),
    });
    toast.success('Workflow saved', 'Saved in this browser.');
  };
  const setStatus = (on: boolean) => {
    if (on && (problems.length || dirty)) {
      setPanel('problems');
      return toast.error(
        problems.length
          ? 'Fix the problems before activating.'
          : 'Save your changes before activating.',
      );
    }
    onPatch({ status: on ? 'Active' : 'Paused' });
    toast.success(on ? 'Workflow activated' : 'Workflow paused', name);
  };

  // Keyboard: ⌘Z / ⇧⌘Z / ⌘Y / ⌘S. Backspace and Delete are handled by React Flow.
  const keys = useRef({ undo, redo, save });
  keys.current = { undo, redo, save };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        keys.current.save();
      } else if (!isTyping(e.target) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) keys.current.redo();
        else keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Graph edits
  const onNodesChange = (changes: NodeChange<StepNode>[]) =>
    setNodes((ns) => applyNodeChanges(changes, ns));
  const onEdgesChange = (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es));
  const outputLabel = (source: string, handle: string | null | undefined) => {
    const n = nodes.find((x) => x.id === source);
    return n && handle ? outputsOf(n.data)?.find((o) => o.id === handle)?.label : undefined;
  };
  const connect = (c: FlowConnection) => {
    record();
    setEdges((es) =>
      addEdge({ ...c, id: uid(), label: outputLabel(c.source, c.sourceHandle) }, es),
    );
  };
  const isValidConnection = (c: Edge | FlowConnection) =>
    c.source !== c.target &&
    !edges.some(
      (e) =>
        e.source === c.source &&
        e.target === c.target &&
        (e.sourceHandle ?? null) === (c.sourceHandle ?? null),
    );

  const addStep = (kind: string, at?: { x: number; y: number }) => {
    record();
    const def = defOf(kind);
    const id = uid();
    const from = at ? undefined : selectedNode;
    let position = at;
    let edge: Edge | undefined;
    if (from) {
      // Connect from the first free output of the selected step and place the new one to its right.
      const outs = outputsOf(from.data) ?? [{ id: null as string | null, label: '' }];
      const free =
        outs.find(
          (o) => !edges.some((e) => e.source === from.id && (e.sourceHandle ?? null) === o.id),
        ) ?? outs[0];
      const siblings = edges.filter((e) => e.source === from.id).length;
      position = { x: from.position.x + 300, y: from.position.y + siblings * 190 };
      if (def.group !== 'Triggers')
        edge = {
          id: uid(),
          source: from.id,
          target: id,
          sourceHandle: free.id,
          label: free.label || undefined,
        };
    }
    if (!position) {
      const r = canvas.current?.getBoundingClientRect();
      position = r
        ? flow.screenToFlowPosition({ x: r.left + r.width / 2 - 120, y: r.top + r.height / 2 - 60 })
        : { x: 0, y: 0 };
    }
    const node: StepNode = {
      id,
      type: 'step',
      position,
      selected: true,
      data: { kind, values: { ...def.defaults } },
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    if (edge) setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), edge]);
    setPanel('inspect');
  };
  const onDrop = (e: DragEvent) => {
    const kind = e.dataTransfer.getData(DRAG_TYPE);
    if (!kind) return;
    e.preventDefault();
    addStep(kind, flow.screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 40 }));
  };

  const changeValues = (id: string, patch: Values, key: string) => {
    record(`${id}:${key}`);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const data = { ...node.data, values: { ...node.data.values, ...patch } };
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    // Outputs can disappear (a split branch removed): drop their connections.
    const outs = outputsOf(data);
    if (outs)
      setEdges((es) =>
        es.filter((e) => e.source !== id || outs.some((o) => o.id === e.sourceHandle)),
      );
  };
  const removeNode = (id: string) => {
    record();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  };
  const duplicateNode = (n: StepNode) => {
    record();
    const copy: StepNode = {
      id: uid(),
      type: 'step',
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: true,
      data: structuredClone(n.data),
    };
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), copy]);
  };
  const autoLayout = () => {
    record();
    const pos = layout(graph, edges);
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos[n.id] ?? n.position })));
    requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 300 }));
  };
  const focusNode = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
    flow.setCenter(n.position.x + 120, n.position.y + 70, {
      zoom: Math.max(flow.getZoom(), 0.9),
      duration: 300,
    });
  };

  // Test run
  const [candidateId, setCandidateId] = useState(SAMPLE_CANDIDATES[0].id);
  const [approvals, setApprovals] = useState('Approve');
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const candidate = SAMPLE_CANDIDATES.find((c) => c.id === candidateId)!;
  const choose = (id: string): string | null => {
    const d = nodes.find((n) => n.id === id)?.data;
    if (!d) return null;
    if (d.kind === 'logic.condition')
      return compare(
        candidate.values[d.values.field] ?? '',
        d.values.operator,
        d.values.value ?? '',
      )
        ? 'yes'
        : 'no';
    if (d.kind === 'logic.split') {
      const actual = (candidate.values[d.values.field] ?? '').toLowerCase();
      const hit = splitValues(d.values.branches).find((b) => b.toLowerCase() === actual);
      return hit ? `v:${hit}` : 'other';
    }
    if (d.kind === 'approval.request') return approvals === 'Approve' ? 'approved' : 'rejected';
    return null;
  };
  const path = runPath(graph, edges, choose);
  const activeId = panel === 'test' && step >= 0 ? path[Math.min(step, path.length - 1)] : null;
  useEffect(() => {
    if (!playing) return;
    if (step >= path.length - 1) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [playing, step, path.length]);
  useEffect(() => {
    if (!activeId) return;
    const n = flow.getNode(activeId);
    if (n)
      flow.setCenter(n.position.x + 120, n.position.y + 70, {
        zoom: flow.getZoom(),
        duration: 300,
      });
  }, [activeId, flow]);
  const resetRun = () => {
    setStep(-1);
    setPlaying(false);
  };
  const fill = (text = '') =>
    text.replace(
      /\{\{([^}]+)\}\}/g,
      (_, k: string) =>
        ({
          'candidate.first_name': candidate.name.split(' ')[0],
          'candidate.full_name': candidate.name,
          'job.title': 'Senior Software Engineer',
          'company.name': 'MyThorneAI',
          'recruiter.name': 'Jerick Dayoha',
          'interview.date': 'Tuesday at 10:00',
          'portal.link': 'the candidate portal',
        })[k.trim()] ?? `{{${k}}}`,
    );
  const explain = (id: string) => {
    const d = nodes.find((n) => n.id === id)!.data;
    const def = defOf(d.kind);
    const v = d.values;
    const branch = choose(id);
    switch (d.kind) {
      case 'logic.condition':
        return `${v.field} is “${candidate.values[v.field] || 'empty'}”, so the answer is ${branch === 'yes' ? 'Yes' : 'No'}.`;
      case 'logic.split':
        return `${v.field} is “${candidate.values[v.field] || 'empty'}”: follows ${branch === 'other' ? 'Other' : branch?.slice(2)}.`;
      case 'approval.request':
        return `${v.approver} ${branch === 'approved' ? 'approves' : 'rejects'} (as set for this test).`;
      case 'logic.wait':
        return `Would wait ${v.duration}; skipped in a test run.`;
      case 'action.send_email':
        return `Would email ${v.to.toLowerCase()}: “${fill(v.subject)}”.`;
      default:
        return def.group === 'Triggers'
          ? `${candidate.name}: ${def.summary(v).toLowerCase()}.`
          : `Would ${def.summary(v).charAt(0).toLowerCase()}${def.summary(v).slice(1)}.`;
    }
  };
  const lastBranch = path.length ? choose(path[path.length - 1]) : null;
  const stoppedEarly =
    lastBranch !== null &&
    !edges.some((e) => e.source === path[path.length - 1] && e.sourceHandle === lastBranch);

  const highlights = useMemo(
    () => ({
      problems: new Set(panel === 'problems' ? problems.flatMap((p) => p.nodeIds) : []),
      active: activeId,
      visited: panel === 'test' && step >= 0 ? new Set(path.slice(0, step + 1)) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panel, problems, activeId, step, path.join()],
  );
  const pathEdges = new Set(
    highlights.visited
      ? path
          .slice(1, step + 1)
          .map((t, i) => edges.find((e) => e.source === path[i] && e.target === t)?.id)
      : [],
  );
  const displayEdges = edges.map((e) => ({
    ...e,
    type: 'smoothstep',
    animated: true,
    style: pathEdges.has(e.id) ? { stroke: 'var(--primary)', strokeWidth: 2.5 } : undefined,
  }));

  const connections = selectedNode
    ? (outputsOf(selectedNode.data)?.map((o) => {
        const e = edges.find((x) => x.source === selectedNode.id && x.sourceHandle === o.id);
        return { output: o.label, target: e ? titleById(e.target) : null };
      }) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <PreviewAlert>
        This editor runs on sample data until the backend exists. Workflows are saved in this
        browser and nothing is sent to candidates.
      </PreviewAlert>

      {/* Top bar */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <IconButton label="Back to workflows" asChild>
          <Link href="/admin/workflows">
            <ArrowLeft />
          </Link>
        </IconButton>
        <input
          aria-label="Workflow name"
          value={name}
          onChange={(e) => {
            record('name');
            setName(e.currentTarget.value);
          }}
          className="min-w-0 flex-1 basis-48 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-fg outline-none hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 sm:max-w-sm"
        />
        <Badge tone={statusTone[workflow.status]} dot>
          {workflow.status}
        </Badge>
        <Badge tone="amber">Preview</Badge>
        <span className="text-xs text-fg-subtle" aria-live="polite">
          {dirty ? 'Unsaved changes' : `Saved ${formatRelative(workflow.updatedAt)}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <IconButton
            label="Undo (⌘Z)"
            variant="quiet"
            size="sm"
            disabled={!past.current.length}
            onClick={undo}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="Redo (⇧⌘Z)"
            variant="quiet"
            size="sm"
            disabled={!future.current.length}
            onClick={redo}
          >
            <Redo2 />
          </IconButton>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" leftIcon={<History />}>
                Versions
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>
                {workflow.versions.length
                  ? `Last ${MAX_VERSIONS} saves, newest first`
                  : 'No saved versions yet'}
              </MenuLabel>
              {workflow.versions.map((v, i) => (
                <MenuItem
                  key={v.id}
                  onSelect={() => {
                    record();
                    restore({ name: v.name, nodes: v.nodes, edges: v.edges });
                    toast.success('Version restored', 'Save to keep it, or undo to go back.');
                  }}
                >
                  {i === 0 ? 'Current save' : `Saved ${formatRelative(v.savedAt)}`} ·{' '}
                  {v.nodes.length} steps
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Button
            variant={panel === 'problems' ? 'soft' : 'secondary'}
            size="sm"
            leftIcon={<ShieldCheck />}
            onClick={() => {
              setPanel('problems');
              if (!problems.length)
                toast.success('No problems found', 'This workflow is ready to activate.');
            }}
          >
            Validate
          </Button>
          <Button
            variant={panel === 'test' ? 'soft' : 'secondary'}
            size="sm"
            leftIcon={<FlaskConical />}
            onClick={() => {
              setPanel('test');
              resetRun();
            }}
          >
            Test run
          </Button>
          {workflow.status === 'Active' ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pause />}
              onClick={() => setStatus(false)}
            >
              Pause
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Play />}
              onClick={() => setStatus(true)}
            >
              Activate
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty}>
            Save
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[560px] lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        {/* Palette */}
        <Card className="hidden overflow-y-auto p-3 lg:block">
          <p className="mb-3 px-1 text-2xs text-fg-subtle">
            Drag a step onto the canvas, or click to add it after the selected step.
          </p>
          {GROUPS.map((g) => (
            <div key={g} className="mb-4">
              <Eyebrow className="mb-1.5 px-1">{g}</Eyebrow>
              <ul className="space-y-0.5">
                {STEPS.filter((s) => s.group === g).map((s) => (
                  <li key={s.kind}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_TYPE, s.kind);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => addStep(s.kind)}
                      className="flex w-full cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm text-fg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
                    >
                      <StepIcon kind={s.kind} className="size-6 [&_svg]:size-3.5" />
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        {/* Canvas */}
        <Card className="relative h-[65dvh] min-h-[420px] overflow-hidden lg:h-auto lg:min-h-0">
          <div ref={canvas} className="absolute inset-0">
            <Highlights.Provider value={highlights}>
              <ReactFlow
                nodes={nodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={connect}
                isValidConnection={isValidConnection}
                onNodeDragStart={() => record()}
                onBeforeDelete={async () => {
                  record();
                  return true;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={onDrop}
                onPaneClick={() => panel === 'test' || setPanel('inspect')}
                onNodeClick={() => panel === 'test' || setPanel('inspect')}
                snapToGrid
                snapGrid={[20, 20]}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.25}
                defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                className={cn(
                  'bg-background',
                  '[--xy-background-color:var(--background)] [--xy-background-pattern-dots-color:var(--border)]',
                  '[--xy-edge-stroke:var(--fg-subtle)] [--xy-edge-stroke-selected:var(--primary)] [--xy-connectionline-stroke:var(--primary)]',
                  '[--xy-edge-label-background-color:var(--card)] [--xy-edge-label-color:var(--fg-muted)]',
                  '[--xy-minimap-background-color:var(--card)] [--xy-minimap-mask-background-color:color-mix(in_srgb,var(--secondary)_70%,transparent)]',
                  '[--xy-controls-button-background-color:var(--card)] [--xy-controls-button-background-color-hover:var(--accent)] [--xy-controls-button-color:var(--fg-muted)] [--xy-controls-button-color-hover:var(--fg)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-box-shadow:none]',
                  '[--xy-selection-background-color:color-mix(in_srgb,var(--primary)_8%,transparent)] [--xy-selection-border:1px_solid_var(--primary)]',
                  '[--xy-attribution-background-color:transparent]',
                )}
                aria-label="Workflow canvas"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
                <Controls
                  showInteractive={false}
                  className="overflow-hidden rounded-md border border-border"
                />
                <MiniMap
                  pannable
                  zoomable
                  ariaLabel="Workflow overview"
                  className="hidden overflow-hidden rounded-md border border-border sm:block"
                  nodeColor={(n) => {
                    const g = defOf((n as StepNode).data.kind).group;
                    return g === 'Triggers'
                      ? 'var(--primary)'
                      : g === 'Approvals'
                        ? 'var(--tone-amber-dot)'
                        : g === 'Actions'
                          ? 'var(--tone-green-dot)'
                          : 'var(--tone-gray-dot)';
                  }}
                />
                <Panel position="top-right" className="flex gap-2">
                  <Menu>
                    <MenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Plus />}
                        className="lg:hidden"
                      >
                        Add step
                      </Button>
                    </MenuTrigger>
                    <MenuContent align="end" className="max-h-80 overflow-y-auto">
                      {GROUPS.map((g, i) => (
                        <div key={g}>
                          {i > 0 && <MenuSeparator />}
                          <MenuLabel>{g}</MenuLabel>
                          {STEPS.filter((s) => s.group === g).map((s) => (
                            <MenuItem key={s.kind} onSelect={() => addStep(s.kind)}>
                              {s.label}
                            </MenuItem>
                          ))}
                        </div>
                      ))}
                    </MenuContent>
                  </Menu>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<LayoutGrid />}
                    onClick={autoLayout}
                  >
                    Auto-layout
                  </Button>
                </Panel>
                {nodes.length === 0 && (
                  <Panel position="top-center" className="mt-16">
                    <EmptyState
                      compact
                      icon={WorkflowIcon}
                      title="Start with a trigger"
                      description="Pick what starts this workflow from the Triggers list."
                      action={
                        <Button size="sm" onClick={() => addStep('trigger.stage_entered')}>
                          Add “Stage entered”
                        </Button>
                      }
                    />
                  </Panel>
                )}
              </ReactFlow>
            </Highlights.Provider>
          </div>
        </Card>

        {/* Right panel */}
        <Card className="overflow-y-auto p-4">
          {panel === 'problems' ? (
            <section aria-label="Problems">
              <PanelHeader title="Validation" onClose={() => setPanel('inspect')} />
              {problems.length === 0 ? (
                <Alert tone="success">
                  One trigger, no loops, every branch connected and every step reachable. Ready to
                  activate.
                </Alert>
              ) : (
                <>
                  <p className="mb-3 text-sm text-fg-muted">
                    {problems.length} {problems.length === 1 ? 'problem' : 'problems'} to fix before
                    this workflow can run. Click one to find it on the canvas.
                  </p>
                  <ul className="space-y-2">
                    {problems.map((p) => (
                      <li key={p.message}>
                        <button
                          type="button"
                          disabled={!p.nodeIds.length}
                          onClick={() => focusNode(p.nodeIds[0])}
                          className="flex w-full gap-2 rounded-md border border-border-subtle bg-tone-red-bg/50 px-3 py-2 text-left text-sm text-fg enabled:hover:border-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <AlertTriangle
                            className="mt-0.5 size-4 shrink-0 text-destructive"
                            aria-hidden
                          />
                          {p.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : panel === 'test' ? (
            <section aria-label="Test run" className="space-y-4">
              <PanelHeader
                title="Test run"
                onClose={() => {
                  resetRun();
                  setPanel('inspect');
                }}
              />
              <p className="text-sm text-fg-muted">
                Walk one sample candidate through the workflow. Nothing is sent.
              </p>
              <Select
                inset
                label="Sample candidate"
                data={SAMPLE_CANDIDATES.map((c) => ({ value: c.id, label: c.name }))}
                value={candidateId}
                onChange={(v) => {
                  if (v) setCandidateId(v);
                  resetRun();
                }}
              />
              <p className="text-2xs text-fg-subtle">
                {Object.entries(candidate.values)
                  .filter(([, x]) => x)
                  .map(([k, x]) => `${k}: ${x}`)
                  .join(' · ')}
              </p>
              <Select
                inset
                label="Approvals in this test"
                data={['Approve', 'Reject']}
                value={approvals}
                onChange={(v) => {
                  if (v) setApprovals(v);
                  resetRun();
                }}
              />
              {path.length === 0 ? (
                <Alert tone="warning">Add a trigger before running a test.</Alert>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      leftIcon={<SkipForward />}
                      disabled={step >= path.length - 1}
                      onClick={() => {
                        setPlaying(false);
                        setStep((s) => s + 1);
                      }}
                    >
                      {step < 0 ? 'Start' : 'Next step'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={playing ? <Pause /> : <Play />}
                      disabled={step >= path.length - 1 && !playing}
                      onClick={() => setPlaying((p) => !p)}
                    >
                      {playing ? 'Pause' : 'Play'}
                    </Button>
                    <IconButton
                      label="Restart"
                      variant="quiet"
                      size="sm"
                      onClick={resetRun}
                      disabled={step < 0}
                    >
                      <RotateCcw />
                    </IconButton>
                  </div>
                  <ol className="space-y-2" aria-live="polite">
                    {path.slice(0, step + 1).map((id, i) => (
                      <li
                        key={id}
                        className={cn(
                          'flex gap-2.5 rounded-md border px-3 py-2',
                          id === activeId ? 'border-primary bg-accent' : 'border-border-subtle',
                        )}
                      >
                        <span className="tnum mt-0.5 text-xs font-semibold text-fg-subtle">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg">{titleById(id)}</p>
                          <p className="text-xs text-fg-muted">{explain(id)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {step >= path.length - 1 && (
                    <Alert tone={stoppedEarly ? 'warning' : 'success'}>
                      {stoppedEarly
                        ? `The run stops at “${titleById(path[path.length - 1])}”: the branch it needs is not connected.`
                        : `Run complete in ${path.length} steps.`}
                    </Alert>
                  )}
                </>
              )}
            </section>
          ) : selectedNode ? (
            <StepInspector
              key={selectedNode.id}
              node={selectedNode}
              connections={connections}
              onChange={(patch, key) => changeValues(selectedNode.id, patch, key)}
              onDuplicate={() => duplicateNode(selectedNode)}
              onDelete={() => removeNode(selectedNode.id)}
            />
          ) : selectedEdge ? (
            <EdgeInspector
              key={selectedEdge.id}
              edge={selectedEdge}
              from={titleById(selectedEdge.source)}
              to={titleById(selectedEdge.target)}
              onChange={(label) => {
                record(`${selectedEdge.id}:label`);
                setEdges((es) =>
                  es.map((e) =>
                    e.id === selectedEdge.id ? { ...e, label: label || undefined } : e,
                  ),
                );
              }}
              onDelete={() => {
                record();
                setEdges((es) => es.filter((e) => e.id !== selectedEdge.id));
              }}
            />
          ) : (
            <Overview
              steps={nodes.length}
              connections={edges.length}
              problems={problems.length}
              onValidate={() => setPanel('problems')}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <IconButton
        label={`Close ${title.toLowerCase()}`}
        variant="quiet"
        size="sm"
        onClick={onClose}
      >
        <X />
      </IconButton>
    </div>
  );
}

function Overview({
  steps,
  connections,
  problems,
  onValidate,
}: {
  steps: number;
  connections: number;
  problems: number;
  onValidate: () => void;
}) {
  const shortcuts: [string, string[]][] = [
    ['Undo', ['⌘', 'Z']],
    ['Redo', ['⇧', '⌘', 'Z']],
    ['Save', ['⌘', 'S']],
    ['Delete selected', ['⌫']],
    ['Select several', ['⇧', 'drag']],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Select a step to edit it</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Click a step or a connection on the canvas. Drag from a dot on the right of a step to
          connect it to the next one.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Steps', steps],
          ['Connections', connections],
          ['Problems', problems],
        ].map(([label, n]) => (
          <div key={label} className="rounded-md bg-muted px-2 py-2.5">
            <dd className="tnum text-lg font-semibold text-fg">{n}</dd>
            <dt className="text-2xs text-fg-subtle">{label}</dt>
          </div>
        ))}
      </dl>
      {problems > 0 && (
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          leftIcon={<ShieldCheck />}
          onClick={onValidate}
        >
          Show problems
        </Button>
      )}
      <div>
        <Eyebrow className="mb-2">Shortcuts</Eyebrow>
        <ul className="space-y-1.5 text-sm text-fg-muted">
          {shortcuts.map(([label, ks]) => (
            <li key={label} className="flex items-center justify-between">
              {label}
              <span className="flex gap-1">
                {ks.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
