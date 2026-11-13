// Graph rules for the workflow editor. Plain TypeScript, no React, so the check can run in node.

export type GNode = {
  id: string;
  label: string;
  trigger?: boolean;
  /** Source handles that must each lead somewhere (condition Yes/No, approval Approved/Rejected). */
  branches?: { id: string; label: string }[];
};
export type GEdge = { source: string; target: string; sourceHandle?: string | null };
export type Problem = { message: string; nodeIds: string[] };

const outgoing = (edges: GEdge[]) => {
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  return out;
};

/** Ids of the nodes on one cycle, or null when the graph is acyclic. */
export function findCycle(nodes: GNode[], edges: GEdge[]): string[] | null {
  const out = outgoing(edges);
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return stack.slice(stack.indexOf(id));
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of out.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const n of nodes) {
    const cycle = visit(n.id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Longest-path layering (Kahn): every node sits one layer right of its furthest parent.
 * Nodes on a cycle never reach in-degree 0; they go in one extra layer at the end.
 */
export function layers(nodes: GNode[], edges: GEdge[]): string[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const valid = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of valid) indeg.set(e.target, indeg.get(e.target)! + 1);
  const out = outgoing(valid);
  const depth = new Map<string, number>();
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of out.get(id) ?? []) {
      depth.set(next, Math.max(depth.get(next) ?? 0, depth.get(id)! + 1));
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  const result: string[][] = [];
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (d !== undefined) (result[d] ??= []).push(n.id);
  }
  const stuck = nodes.filter((n) => !depth.has(n.id)).map((n) => n.id);
  if (stuck.length) result.push(stuck);
  return result.filter(Boolean);
}

/**
 * Left-to-right layered layout. Inside a layer, nodes are ordered by the average position of
 * their parents (one barycenter pass), which untangles most branch crossings.
 */
export function layout(
  nodes: GNode[],
  edges: GEdge[],
  gap = { x: 300, y: 190 },
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const rank = new Map<string, number>();
  layers(nodes, edges).forEach((layer, li) => {
    const parentsAvg = (id: string) => {
      const ranks = edges
        .filter((e) => e.target === id && rank.has(e.source))
        .map((e) => rank.get(e.source)!);
      return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
    };
    const ordered = li === 0 ? layer : [...layer].sort((a, b) => parentsAvg(a) - parentsAvg(b));
    ordered.forEach((id, i) => {
      rank.set(id, i);
      pos[id] = { x: li * gap.x, y: (i - (ordered.length - 1) / 2) * gap.y };
    });
  });
  return pos;
}

/** Everything that stops a workflow from being activated. Empty means valid. */
export function validate(nodes: GNode[], edges: GEdge[]): Problem[] {
  const problems: Problem[] = [];
  const triggers = nodes.filter((n) => n.trigger);
  if (triggers.length === 0)
    problems.push({
      message: 'Add a step from the Start when list to begin the workflow.',
      nodeIds: [],
    });
  if (triggers.length > 1)
    problems.push({
      message: `A workflow can have only one starting step. This one has ${triggers.length}.`,
      nodeIds: triggers.map((t) => t.id),
    });
  for (const t of triggers)
    if (edges.some((e) => e.target === t.id))
      problems.push({
        message: `“${t.label}” starts the workflow, so no step can lead into it.`,
        nodeIds: [t.id],
      });

  const cycle = findCycle(nodes, edges);
  if (cycle)
    problems.push({
      message: `These steps go around in a circle: ${cycle.map((id) => nodes.find((n) => n.id === id)?.label ?? id).join(' → ')}.`,
      nodeIds: cycle,
    });

  for (const n of nodes)
    for (const b of n.branches ?? [])
      if (!edges.some((e) => e.source === n.id && e.sourceHandle === b.id))
        problems.push({
          message: `“${n.label}” has nothing connected to its “${b.label}” path.`,
          nodeIds: [n.id],
        });

  if (triggers.length && nodes.length === 1)
    problems.push({
      message: `Add a step after “${triggers[0].label}”.`,
      nodeIds: [triggers[0].id],
    });

  // Orphans: steps the trigger(s) can never reach.
  const out = outgoing(edges);
  const seen = new Set<string>();
  const queue = triggers.map((t) => t.id);
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(out.get(id) ?? []));
  }
  const orphans = triggers.length ? nodes.filter((n) => !seen.has(n.id)) : [];
  if (orphans.length)
    problems.push({
      message: `${orphans.length === 1 ? 'One step is' : `${orphans.length} steps are`} not linked to the start: ${orphans.map((n) => n.label).join(', ')}.`,
      nodeIds: orphans.map((n) => n.id),
    });
  return problems;
}

/**
 * The path one run takes from the trigger. `choose` names the source handle to follow for a node
 * (null follows the first connection). Stops at the end, or when a step would repeat.
 */
export function runPath(
  nodes: GNode[],
  edges: GEdge[],
  choose: (id: string) => string | null,
): string[] {
  const start = nodes.find((n) => n.trigger);
  if (!start) return [];
  const path = [start.id];
  for (;;) {
    const id = path[path.length - 1];
    const handle = choose(id);
    const next = edges.find(
      (e) => e.source === id && (handle === null || e.sourceHandle === handle),
    );
    if (!next || path.includes(next.target)) return path;
    path.push(next.target);
  }
}

/** Condition operators, compared case-insensitively; numbers when both sides are numeric. */
export function compare(actual: string, op: string, expected: string): boolean {
  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  switch (op) {
    case 'is':
      return a === e;
    case 'is not':
      return a !== e;
    case 'contains':
      return a.includes(e);
    case 'greater than':
      return Number(a) > Number(e);
    case 'less than':
      return Number(a) < Number(e);
    default:
      return false;
  }
}
