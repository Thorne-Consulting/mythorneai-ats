'use client';

import '@xyflow/react/dist/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Connection as FlowConnection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FlaskConical,
  LayoutGrid,
  Redo2,
  ShieldCheck,
  Undo2,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CountBadge,
  EmptyState,
  IconButton,
  Modal,
  RadioGroup,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { defOf, isTrigger, outputsOf, titleOf } from './catalog';
import { layout, pathEdges as edgesOnPath } from './graph';
import { StepInspector } from './Inspector';
import {
  AddStepButton,
  Canvas,
  edgeTypes,
  nodeTypes,
  type CanvasState,
  type FlowEdge,
  type StepNode,
} from './StepFlowNode';
import { uid } from './templates';
import { TestPanel } from './TestPanel';
import { RunsTab, SettingsTab, VersionsTab } from './WorkflowTabs';
import {
  statusTone,
  useLookups,
  useWorkflow,
  workflowKeys,
  type DryStep,
  type Graph,
  type Lookups,
  type Problem,
  type Values,
  type WorkflowDetail,
} from './workflow-api';

const NODE_WIDTH = 256;

/** Route entry: the editor takes the whole window, with its own top bar. */
export function WorkflowEditorPage({ id }: { id: string }) {
  const workflow = useWorkflow(id);
  const lookups = useLookups();
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {workflow.data ? (
        <ReactFlowProvider>
          <Editor key={id} workflow={workflow.data} lookups={lookups.data} />
        </ReactFlowProvider>
      ) : workflow.error ? (
        <div className="m-auto w-full max-w-lg p-4">
          <Card>
            <EmptyState
              icon={WorkflowIcon}
              title={
                workflow.error instanceof ApiError && workflow.error.status === 404
                  ? 'Workflow not found'
                  : 'Could not open the workflow'
              }
              description={
                workflow.error instanceof ApiError && workflow.error.status === 404
                  ? 'It may have been deleted.'
                  : 'Check your connection, then try again.'
              }
              action={
                <Button asChild>
                  <Link href="/settings/workflows">Back to workflows</Link>
                </Button>
              }
            />
          </Card>
        </div>
      ) : (
        <>
          <div className="h-14 border-b border-border bg-card" />
          <div className="flex flex-1 items-start justify-center pt-16">
            <div className="flex w-64 flex-col items-center gap-6">
              <Skeleton className="h-28 w-64 rounded-xl" />
              <Skeleton className="h-28 w-64 rounded-xl" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Snapshot = { name: string; nodes: StepNode[]; edges: FlowEdge[] };
type Tab = 'editor' | 'runs' | 'versions' | 'settings';
type PanelMode = 'inspect' | 'problems' | 'test' | null;

const toFlow = (graph: Graph): Snapshot['nodes'] =>
  graph.nodes.map((n) => ({
    id: n.id,
    type: 'step',
    position: n.position ?? { x: 0, y: 0 },
    data: { kind: n.kind, values: n.values },
  }));
const toFlowEdges = (graph: Graph): FlowEdge[] =>
  graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    type: 'plus',
    data: {},
  }));
const toGraph = (nodes: StepNode[], edges: FlowEdge[]): Graph => ({
  nodes: nodes.map((n) => ({
    id: n.id,
    kind: n.data.kind,
    values: n.data.values,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
  })),
});
const graphKey = (s: Snapshot) => JSON.stringify([s.name, toGraph(s.nodes, s.edges)]);

/** Lays every step out top to bottom; "Yes" goes left of "No", and split paths in their order. */
function arrange(nodes: StepNode[], edges: FlowEdge[]): StepNode[] {
  const order = (source: string, handle: string | null | undefined) => {
    const n = nodes.find((x) => x.id === source);
    const outs = n ? outputsOf(n.data) : null;
    return outs
      ? Math.max(
          0,
          outs.findIndex((o) => o.id === handle),
        )
      : 0;
  };
  const offset = (source: string, handle: string | null | undefined) => {
    const n = nodes.find((x) => x.id === source);
    const outs = n ? outputsOf(n.data) : null;
    return outs ? (order(source, handle) + 0.5) * (NODE_WIDTH / outs.length) - NODE_WIDTH / 2 : 0;
  };
  const pos = layout(nodes, edges, { x: 300, y: 190 }, order, offset);
  return nodes.map((n) =>
    pos[n.id] ? { ...n, position: { x: pos[n.id].x - NODE_WIDTH / 2, y: pos[n.id].y } } : n,
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function useIsPhone() {
  return useSyncExternalStore(
    (on) => {
      const m = window.matchMedia('(max-width: 767px)');
      m.addEventListener('change', on);
      return () => m.removeEventListener('change', on);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
}

function Editor({ workflow, lookups }: { workflow: WorkflowDetail; lookups: Lookups | undefined }) {
  const flow = useReactFlow<StepNode, FlowEdge>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const phone = useIsPhone();
  const archived = workflow.status === 'Archived';
  const readOnly = phone || archived;

  const tab = (
    ['runs', 'versions', 'settings'].includes(params.get('tab') ?? '')
      ? params.get('tab')
      : 'editor'
  ) as Tab;
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (next === 'editor') q.delete('tab');
    else q.set('tab', next);
    q.delete('status');
    router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false });
  };

  const [name, setName] = useState(workflow.name);
  const [nodes, setNodes] = useState<StepNode[]>(() => {
    const ns = toFlow(workflow.draft);
    const es = toFlowEdges(workflow.draft);
    // Graphs made on the server (templates, built-ins) have no positions yet.
    return workflow.draft.nodes.some((n) => !n.position) ? arrange(ns, es) : ns;
  });
  const [edges, setEdges] = useState<FlowEdge[]>(() => toFlowEdges(workflow.draft));
  const [panel, setPanel] = useState<PanelMode>(null);

  // Undo and redo: snapshots taken before each change. Typing in one field is one step.
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

  // The draft saves itself as you work; publishing is what changes live runs.
  const saved = useRef(graphKey({ name: workflow.name, nodes, edges }));
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const save = useMutation({
    mutationFn: (s: Snapshot) =>
      api.put(`/api/workflows/${workflow.id}`, {
        name: s.name.trim(),
        graph: toGraph(s.nodes, s.edges),
      }),
  });
  const saveNow = useCallback(() => {
    const snap = current.current;
    const key = graphKey(snap);
    if (key === saved.current || readOnly) return;
    if (!snap.name.trim()) return setSaveState('error');
    setSaveState('saving');
    save.mutate(snap, {
      onSuccess: () => {
        saved.current = key;
        setSaveState(graphKey(current.current) === key ? 'saved' : 'unsaved');
        queryClient.invalidateQueries({ queryKey: workflowKeys.one(workflow.id) });
        queryClient.invalidateQueries({ queryKey: workflowKeys.list });
      },
      onError: (error: Error) => {
        setSaveState('error');
        toast.error('Could not save your changes', error.message);
      },
    });
  }, [queryClient, readOnly, save, workflow.id]);
  const snapshotKey = graphKey({ name, nodes, edges });
  useEffect(() => {
    if (snapshotKey === saved.current) return;
    setSaveState('unsaved');
    const t = setTimeout(saveNow, 800);
    return () => clearTimeout(t);
  }, [snapshotKey, saveNow]);
  useEffect(() => {
    if (saveState === 'saved') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // Problems come from the server, so the editor and Publish use the same rules.
  const graphOnly =
    JSON.stringify(toGraph(nodes, edges).nodes.map((n) => [n.id, n.kind, n.values])) +
    JSON.stringify(edges.map((e) => [e.source, e.target, e.sourceHandle]));
  const [check, setCheck] = useState<{ problems: Problem[]; alreadyInStage: number }>({
    problems: workflow.problems,
    alreadyInStage: 0,
  });
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .post<{ problems: Problem[]; alreadyInStage: number }>('/api/workflows/check', {
          graph: toGraph(current.current.nodes, current.current.edges),
        })
        .then(setCheck)
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [graphOnly]);
  const problems = check.problems;
  const problemsFor = (id: string) => problems.filter((p) => p.nodeIds.includes(id));

  // Keyboard: ⌘Z, ⇧⌘Z, ⌘Y, ⌘S. Delete and Backspace remove the selection (React Flow).
  const keys = useRef({ undo, redo, saveNow });
  keys.current = { undo, redo, saveNow };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        keys.current.saveNow();
      } else if (!isTyping(e.target) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) keys.current.redo();
        else keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- Graph edits
  const selected = nodes.find((n) => n.selected);
  const titleById = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n ? titleOf(n.data) : 'Unknown step';
  };
  const openOutputs = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return [];
      const outs = outputsOf(n.data)?.map((o) => o.id as string | null) ?? [null];
      return outs.filter(
        (h) => !edges.some((e) => e.source === id && (e.sourceHandle ?? null) === h),
      );
    },
    [nodes, edges],
  );
  const newNode = (kind: string): StepNode => ({
    id: uid(),
    type: 'step',
    position: { x: 0, y: 0 },
    selected: true,
    data: { kind, values: { ...defOf(kind).defaults } },
  });
  const edge = (source: string, target: string, handle: string | null): FlowEdge => ({
    id: uid(),
    source,
    target,
    sourceHandle: handle,
    type: 'plus',
    data: {},
  });
  const commit = (ns: StepNode[], es: FlowEdge[], relayout = true) => {
    setNodes(relayout ? arrange(ns, es) : ns);
    setEdges(es);
    setPanel('inspect');
  };
  const deselect = (ns: StepNode[]) => ns.map((n) => (n.selected ? { ...n, selected: false } : n));
  const addAfter = (source: string, handle: string | null, kind: string) => {
    record();
    const n = newNode(kind);
    commit([...deselect(nodes), n], [...edges, edge(source, n.id, handle)]);
  };
  const insertOn = (edgeId: string, kind: string) => {
    const old = edges.find((e) => e.id === edgeId);
    if (!old) return;
    record();
    const n = newNode(kind);
    const out = outputsOf(n.data)?.[0]?.id ?? null;
    commit(
      [...deselect(nodes), n],
      [
        ...edges.filter((e) => e.id !== edgeId),
        edge(old.source, n.id, old.sourceHandle ?? null),
        edge(n.id, old.target, out),
      ],
    );
  };
  const addTrigger = (kind: string) => {
    record();
    const n = newNode(kind);
    const roots = nodes.filter((x) => !edges.some((e) => e.target === x.id));
    commit([...deselect(nodes), n], roots[0] ? [...edges, edge(n.id, roots[0].id, null)] : edges);
  };
  const changeValues = (id: string, patch: Values, key: string) => {
    record(`${id}:${key}`);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const data = { ...node.data, values: { ...node.data.values, ...patch } };
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    // A split path that was removed takes its connection with it.
    const outs = outputsOf(data);
    if (outs)
      setEdges((es) =>
        es.filter((e) => e.source !== id || outs.some((o) => o.id === e.sourceHandle)),
      );
  };
  /** Removes steps; a step with one way in and one way out leaves its neighbours joined. */
  const remove = (ids: string[]) => {
    let es = edges;
    for (const id of ids) {
      const ins = es.filter((e) => e.target === id);
      const outs = es.filter((e) => e.source === id);
      es = es.filter((e) => e.source !== id && e.target !== id);
      if (
        ins.length === 1 &&
        outs.length === 1 &&
        !ids.includes(ins[0].source) &&
        !ids.includes(outs[0].target)
      )
        es = [...es, edge(ins[0].source, outs[0].target, ins[0].sourceHandle ?? null)];
    }
    setNodes((ns) => ns.filter((n) => !ids.includes(n.id)));
    setEdges(es);
  };
  const duplicate = (n: StepNode) => {
    record();
    const copy: StepNode = {
      id: uid(),
      type: 'step',
      position: { x: n.position.x + NODE_WIDTH + 40, y: n.position.y },
      selected: true,
      data: structuredClone(n.data),
    };
    setNodes((ns) => [...deselect(ns), copy]);
  };
  const tidy = () => {
    record();
    setNodes((ns) => arrange(ns, edges));
    requestAnimationFrame(() => openView());
  };
  const onNodesChange = (changes: NodeChange<StepNode>[]) => {
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) {
      remove(removed);
      return;
    }
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === 'select' && c.selected))
      setPanel((p) => (p === 'test' ? p : 'inspect'));
  };
  const onEdgesChange = (changes: EdgeChange<FlowEdge>[]) =>
    setEdges((es) => applyEdgeChanges(changes, es));
  const connect = (c: FlowConnection) => {
    record();
    // One output leads to one step: a new line from it replaces the old one.
    setEdges((es) => [
      ...es.filter(
        (e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)),
      ),
      edge(c.source, c.target, c.sourceHandle ?? null),
    ]);
  };
  const isValidConnection = (c: FlowEdge | FlowConnection) =>
    c.source !== c.target && !isTrigger(nodes.find((n) => n.id === c.target)?.data.kind ?? '');

  // Open readable: fitted when that stays near 100%, otherwise 100% with the start at the top.
  const initialized = useNodesInitialized();
  const box = useRef<HTMLDivElement>(null);
  const openView = useCallback(() => {
    const el = box.current;
    const all = flow.getNodes();
    if (!el || !all.length) return;
    const xs = all.map((n) => n.position.x);
    const ys = all.map((n) => n.position.y);
    const right = Math.max(...all.map((n) => n.position.x + (n.measured?.width ?? NODE_WIDTH)));
    const bottom = Math.max(...all.map((n) => n.position.y + (n.measured?.height ?? 120)));
    const w = right - Math.min(...xs);
    const h = bottom - Math.min(...ys);
    // Fit when that keeps text readable; a long workflow opens at 100% from the top instead.
    const widthFit = Math.min(1, (el.clientWidth - 96) / w);
    const fit = Math.min(widthFit, (el.clientHeight - 120) / h);
    const zoom = fit >= 0.85 ? fit : Math.max(0.75, widthFit);
    const x = el.clientWidth / 2 - (Math.min(...xs) + w / 2) * zoom;
    const fits = h * zoom <= el.clientHeight - 120;
    const y = fits
      ? (el.clientHeight - h * zoom) / 2 - Math.min(...ys) * zoom
      : 56 - Math.min(...ys) * zoom;
    flow.setViewport({ x, y, zoom }, { duration: 0 });
  }, [flow]);
  const opened = useRef(false);
  useEffect(() => {
    if (initialized && !opened.current && tab === 'editor') {
      opened.current = true;
      openView();
    }
  }, [initialized, openView, tab]);
  const focusNode = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
    flow.setCenter(n.position.x + NODE_WIDTH / 2, n.position.y + 60, {
      zoom: Math.max(flow.getZoom(), 0.9),
      duration: 300,
    });
  };

  // ----- Test run highlights
  const [test, setTest] = useState<DryStep[] | null>(null);
  const canvasState: CanvasState = {
    lookups,
    readOnly,
    problems: new Set(panel === 'problems' ? problems.flatMap((p) => p.nodeIds) : []),
    visited: panel === 'test' && test ? new Set(test.map((s) => s.nodeId)) : null,
    active: null,
    outcomes:
      panel === 'test' && test ? Object.fromEntries(test.map((s) => [s.nodeId, s.status])) : {},
    pathEdges:
      panel === 'test' && test
        ? edgesOnPath(
            test.map((s) => s.nodeId),
            edges,
          )
        : new Set(),
    openOutputs,
    addAfter,
    insertOn,
  };
  const displayEdges = edges.map((e) => ({
    ...e,
    animated: canvasState.pathEdges.has(e.id),
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--fg-subtle)' },
  }));
  const trigger = nodes.find((n) => isTrigger(n.data.kind));

  // ----- Status and publish
  const [status, setStatus] = useState(workflow.status);
  useEffect(() => setStatus(workflow.status), [workflow.status]);
  const toggle = useMutation({
    mutationFn: (on: boolean) =>
      api.post(`/api/workflows/${workflow.id}/${on ? 'resume' : 'pause'}`),
    onMutate: (on) => setStatus(on ? 'Active' : 'Paused'),
    onSuccess: (_, on) => {
      toast.success(
        on ? 'Workflow is on' : 'Workflow paused',
        on ? undefined : 'Runs in progress wait here until you turn it back on.',
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error: Error) => {
      setStatus(workflow.status);
      toast.error('Could not change it', error.message);
    },
  });
  const [publishing, setPublishing] = useState(false);
  const restoreArchived = useMutation({
    mutationFn: () => api.post(`/api/workflows/${workflow.id}/restore`),
    onSuccess: () => {
      toast.success('Workflow restored', 'It is paused. Turn it on when you are ready.');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
  const settings = useMutation({
    mutationFn: (patch: Partial<WorkflowDetail>) => api.put(`/api/workflows/${workflow.id}`, patch),
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: workflowKeys.one(workflow.id) });
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
  const loadVersion = useMutation({
    mutationFn: (versionId: string) =>
      api.post<{ draft: Graph }>(`/api/workflows/${workflow.id}/versions/${versionId}/restore`),
    onSuccess: ({ draft }) => {
      record();
      const ns = toFlow(draft);
      const es = toFlowEdges(draft);
      const placed = draft.nodes.some((n) => !n.position) ? arrange(ns, es) : ns;
      setNodes(placed);
      setEdges(es);
      saved.current = graphKey({ name, nodes: placed, edges: es });
      queryClient.invalidateQueries({ queryKey: workflowKeys.one(workflow.id) });
      setTab('editor');
      opened.current = false;
      toast.success('Version loaded as the draft', 'Publish it to make it run.');
    },
    onError: (error: Error) => toast.error('Could not load it', error.message),
  });

  const connections = selected
    ? (outputsOf(selected.data)?.map((o) => {
        const e = edges.find((x) => x.source === selected.id && x.sourceHandle === o.id);
        return { output: o.label, target: e ? titleById(e.target) : null };
      }) ?? null)
    : null;

  // The side panel: resizable on wide screens, full width on phones.
  const [width, setWidth] = useState(400);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const right = window.innerWidth;
    const move = (ev: PointerEvent) => setWidth(Math.min(640, Math.max(340, right - ev.clientX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const showPanel =
    tab === 'editor' &&
    (panel === 'problems' || panel === 'test' || (panel === 'inspect' && !!selected));

  return (
    <>
      {/* Top bar */}
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconButton label="Back to workflows" variant="quiet" asChild>
            <Link href="/settings/workflows">
              <ArrowLeft />
            </Link>
          </IconButton>
          <input
            aria-label="Workflow name"
            value={name}
            readOnly={readOnly}
            onChange={(e) => {
              record('name');
              setName(e.currentTarget.value);
            }}
            className="min-w-0 flex-1 basis-40 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-md font-semibold text-fg outline-none hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 sm:max-w-xs lg:max-w-sm"
          />
          <StatusControl
            status={status}
            disabled={readOnly || toggle.isPending}
            onChange={(on) => toggle.mutate(on)}
          />
          {!readOnly && <SaveState state={saveState} updatedAt={workflow.updatedAt} />}
        </div>
        <nav
          aria-label="Workflow sections"
          className="order-last flex w-full gap-1 overflow-x-auto xl:order-none xl:w-auto"
        >
          {(
            [
              ['editor', 'Steps', 0],
              ['runs', 'Runs', workflow.runs.failed],
              ['versions', 'Versions', 0],
              ['settings', 'Settings', 0],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? 'page' : undefined}
              onClick={() => setTab(value)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-accent hover:text-fg',
                tab === value && 'bg-accent text-accent-foreground',
              )}
            >
              {label}
              {count > 0 && <CountBadge count={count} tone="red" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center justify-end gap-2">
          {tab === 'editor' && !readOnly && (
            <>
              <IconButton
                label="Undo (⌘Z)"
                variant="quiet"
                size="sm"
                disabled={!past.current.length}
                onClick={undo}
                className="max-sm:hidden"
              >
                <Undo2 />
              </IconButton>
              <IconButton
                label="Redo (⇧⌘Z)"
                variant="quiet"
                size="sm"
                disabled={!future.current.length}
                onClick={redo}
                className="max-sm:hidden"
              >
                <Redo2 />
              </IconButton>
              <Button
                variant={panel === 'problems' ? 'soft' : 'secondary'}
                size="sm"
                leftIcon={problems.length ? <AlertTriangle /> : <ShieldCheck />}
                onClick={() => setPanel(panel === 'problems' ? null : 'problems')}
                className={cn(problems.length > 0 && 'text-tone-red-fg')}
              >
                <span className="max-xl:sr-only">Check for problems</span>
                {problems.length > 0 && <span className="tnum xl:hidden">{problems.length}</span>}
              </Button>
              <Button
                variant={panel === 'test' ? 'soft' : 'secondary'}
                size="sm"
                leftIcon={<FlaskConical />}
                onClick={() => setPanel(panel === 'test' ? null : 'test')}
              >
                Test
              </Button>
            </>
          )}
          {archived ? (
            <Button
              size="sm"
              loading={restoreArchived.isPending}
              onClick={() => restoreArchived.mutate()}
            >
              Restore
            </Button>
          ) : (
            !phone && (
              <Button
                size="sm"
                disabled={
                  !workflow.hasUnpublishedChanges &&
                  !!workflow.publishedVersion &&
                  saveState === 'saved'
                }
                onClick={() => {
                  saveNow();
                  setPublishing(true);
                }}
              >
                Publish
              </Button>
            )
          )}
        </div>
      </header>

      {archived && (
        <Alert tone="info" className="rounded-none border-x-0 border-t-0">
          This workflow is archived. It no longer starts, and its history is kept. Restore it to
          change it.
        </Alert>
      )}

      {tab === 'runs' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RunsTab
            workflowId={workflow.id}
            initialFilter={params.get('status') ?? undefined}
            initialRun={params.get('run') ?? undefined}
          />
        </div>
      ) : tab === 'versions' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <VersionsTab workflow={workflow} onLoad={(v) => loadVersion.mutate(v)} />
        </div>
      ) : tab === 'settings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SettingsTab
            workflow={workflow}
            lookups={lookups}
            saving={settings.isPending}
            onSave={(patch) => settings.mutate(patch)}
          />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div ref={box} className="relative min-w-0 flex-1">
            <Canvas.Provider value={canvasState}>
              <ReactFlow
                nodes={nodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={connect}
                isValidConnection={isValidConnection}
                onNodeDragStart={() => record()}
                onBeforeDelete={async () => {
                  record();
                  return true;
                }}
                onPaneClick={() => setPanel((p) => (p === 'inspect' ? null : p))}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                elementsSelectable
                deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
                snapToGrid
                snapGrid={[20, 20]}
                minZoom={0.3}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                className={cn(
                  'bg-background',
                  '[--xy-background-color:var(--background)] [--xy-background-pattern-dots-color:var(--border)]',
                  '[--xy-edge-stroke:var(--fg-subtle)] [--xy-edge-stroke-selected:var(--primary)] [--xy-connectionline-stroke:var(--primary)]',
                  '[--xy-minimap-background-color:var(--card)] [--xy-minimap-mask-background-color:color-mix(in_srgb,var(--secondary)_70%,transparent)]',
                  '[--xy-controls-button-background-color:var(--card)] [--xy-controls-button-background-color-hover:var(--accent)] [--xy-controls-button-color:var(--fg-muted)] [--xy-controls-button-color-hover:var(--fg)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-box-shadow:none]',
                  '[--xy-selection-background-color:color-mix(in_srgb,var(--primary)_8%,transparent)] [--xy-selection-border:1px_solid_var(--primary)]',
                )}
                aria-label="Workflow steps"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
                <Controls
                  showInteractive={false}
                  className="overflow-hidden rounded-md border border-border"
                />
                {nodes.length > 12 && (
                  <MiniMap
                    pannable
                    zoomable
                    ariaLabel="Workflow overview"
                    className="hidden overflow-hidden rounded-md border border-border sm:block"
                  />
                )}
                {!readOnly && nodes.length > 1 && (
                  <Panel position="top-right">
                    <Button variant="secondary" size="sm" leftIcon={<LayoutGrid />} onClick={tidy}>
                      Tidy up
                    </Button>
                  </Panel>
                )}
                {!trigger && !readOnly && (
                  <Panel position="top-center" className="mt-10">
                    <Card className="w-80 p-5 text-center">
                      <p className="text-md font-semibold text-fg">
                        Choose what starts this workflow
                      </p>
                      <p className="mt-1 text-sm text-fg-muted">
                        For example, when a candidate moves into a stage.
                      </p>
                      <div className="mt-4 flex justify-center">
                        <AddStepButton label="Choose what starts it" triggers onPick={addTrigger}>
                          <Button size="sm">Choose a starting step</Button>
                        </AddStepButton>
                      </div>
                    </Card>
                  </Panel>
                )}
              </ReactFlow>
            </Canvas.Provider>
          </div>

          {showPanel && (
            <aside
              aria-label="Step details"
              className="absolute inset-0 z-10 flex flex-col bg-card md:static md:z-auto md:border-l md:border-border"
              style={phone ? undefined : { width }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setWidth((w) => Math.min(640, w + 24));
                  if (e.key === 'ArrowRight') setWidth((w) => Math.max(340, w - 24));
                }}
                className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:outline-none md:block"
              />
              <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                <h2 className="text-md font-semibold text-fg">
                  {panel === 'problems' ? 'Problems' : panel === 'test' ? 'Test run' : 'Step'}
                </h2>
                <IconButton
                  label="Close panel"
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    if (panel === 'test') setTest(null);
                    setPanel(null);
                  }}
                >
                  <X />
                </IconButton>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {panel === 'problems' ? (
                  <ProblemList problems={problems} onFocus={focusNode} />
                ) : panel === 'test' ? (
                  <TestPanel
                    workflowId={workflow.id}
                    graph={() => toGraph(current.current.nodes, current.current.edges)}
                    onResult={setTest}
                  />
                ) : selected && lookups ? (
                  <StepInspector
                    key={selected.id}
                    workflowId={workflow.id}
                    node={{
                      id: selected.id,
                      kind: selected.data.kind,
                      values: selected.data.values,
                    }}
                    lookups={lookups}
                    problems={problemsFor(selected.id)}
                    connections={connections}
                    readOnly={readOnly}
                    onChange={(patch, key) => changeValues(selected.id, patch, key)}
                    onDuplicate={() => duplicate(selected)}
                    onDelete={() => {
                      record();
                      remove([selected.id]);
                      setPanel(null);
                    }}
                  />
                ) : null}
              </div>
            </aside>
          )}
        </div>
      )}

      <PublishModal
        opened={publishing}
        onClose={() => setPublishing(false)}
        workflow={workflow}
        problems={problems}
        alreadyInStage={trigger?.data.kind === 'trigger.stage_entered' ? check.alreadyInStage : 0}
        saving={saveState === 'saving' || saveState === 'unsaved'}
        onShowProblems={() => {
          setPublishing(false);
          setPanel('problems');
        }}
      />
    </>
  );
}

function StatusControl({
  status,
  disabled,
  onChange,
}: {
  status: WorkflowDetail['status'];
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  if (status === 'Draft' || status === 'Archived')
    return (
      <Badge tone={statusTone[status]} dot>
        {status === 'Draft' ? 'Not published' : 'Archived'}
      </Badge>
    );
  return (
    <Switch
      checked={status === 'Active'}
      onCheckedChange={onChange}
      disabled={disabled}
      label={status === 'Active' ? 'On' : 'Paused'}
      aria-label={status === 'Active' ? 'Pause this workflow' : 'Turn this workflow on'}
    />
  );
}

function SaveState({ state, updatedAt }: { state: string; updatedAt: string }) {
  return (
    <span
      className="hidden items-center gap-1 text-xs text-fg-subtle sm:inline-flex"
      aria-live="polite"
    >
      {state === 'saved' && <Check className="size-3.5" aria-hidden />}
      {state === 'saving' || state === 'unsaved'
        ? 'Saving…'
        : state === 'error'
          ? 'Not saved. Give it a name.'
          : `Draft saved ${formatRelative(updatedAt)}`}
    </span>
  );
}

function ProblemList({
  problems,
  onFocus,
}: {
  problems: Problem[];
  onFocus: (id: string) => void;
}) {
  if (problems.length === 0)
    return <Alert tone="success">No problems found. This workflow is ready to publish.</Alert>;
  return (
    <>
      <p className="mb-3 text-sm text-fg-muted">
        Fix {problems.length === 1 ? 'this' : `these ${problems.length}`} before you publish. Click
        one to find it.
      </p>
      <ul className="space-y-2">
        {problems.map((p) => (
          <li key={p.message}>
            <button
              type="button"
              disabled={!p.nodeIds.length}
              onClick={() => onFocus(p.nodeIds[0])}
              className="flex w-full gap-2 rounded-md border border-border-subtle bg-tone-red-bg/50 px-3 py-2 text-left text-sm text-fg enabled:hover:border-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              {p.message}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PublishModal({
  opened,
  onClose,
  workflow,
  problems,
  alreadyInStage,
  saving,
  onShowProblems,
}: {
  opened: boolean;
  onClose: () => void;
  workflow: WorkflowDetail;
  problems: Problem[];
  alreadyInStage: number;
  saving: boolean;
  onShowProblems: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [existing, setExisting] = useState('new');
  const publish = useMutation({
    mutationFn: () =>
      api.post<{ number: number; started: number }>(`/api/workflows/${workflow.id}/publish`, {
        note,
        includeExisting: existing === 'all',
      }),
    onSuccess: (r) => {
      toast.success(
        `Version ${r.number} published`,
        r.started
          ? `Started for ${r.started} ${r.started === 1 ? 'candidate' : 'candidates'} already in the stage.`
          : 'It runs for new events from now on.',
      );
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setNote('');
      onClose();
    },
    onError: (error: Error) => toast.error('Could not publish', error.message),
  });
  const first = !workflow.publishedVersion;
  let body: ReactNode;
  if (problems.length)
    body = (
      <Alert
        tone="danger"
        title={`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} to fix first`}
      >
        {problems[0].message}
      </Alert>
    );
  else
    body = (
      <div className="space-y-5">
        <p className="text-sm text-fg-muted">
          {first
            ? 'Publishing turns the workflow on. From then on it runs for every matching event.'
            : workflow.status === 'Paused'
              ? 'The workflow stays paused. When you turn it on, new runs use this version.'
              : 'New runs use this version. Runs already going finish on the version they started with.'}
        </p>
        {alreadyInStage > 0 && (
          <RadioGroup
            aria-label="Who it starts for"
            value={existing}
            onValueChange={setExisting}
            options={[
              { value: 'new', label: 'Only candidates who move into the stage from now on' },
              {
                value: 'all',
                label: `Also the ${alreadyInStage} ${alreadyInStage === 1 ? 'candidate' : 'candidates'} already in the stage`,
                description: 'They start straight away.',
              },
            ]}
          />
        )}
        <Textarea
          label="What changed (optional)"
          placeholder="For example, waits three days instead of two"
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          maxLength={500}
        />
      </div>
    );
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={first ? 'Publish and turn on' : 'Publish changes'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {problems.length ? (
            <Button onClick={onShowProblems}>Show problems</Button>
          ) : (
            <Button loading={publish.isPending || saving} onClick={() => publish.mutate()}>
              {first ? 'Publish and turn on' : 'Publish'}
            </Button>
          )}
        </>
      }
    >
      {body}
    </Modal>
  );
}
