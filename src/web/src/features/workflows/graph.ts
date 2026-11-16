// Graph layout for the workflow editor. Plain TypeScript, no React, so the check can run in node.
// The rules that decide whether a workflow can run live on the server (WorkflowGraph.Validate).

export type GNode = { id: string };
export type GEdge = { source: string; target: string; sourceHandle?: string | null };

const outgoing = (edges: GEdge[]) => {
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  return out;
};

/**
 * Longest-path layering (Kahn): every node sits one layer below its furthest parent.
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
 * Top-to-bottom layered layout. Inside a layer, nodes are ordered by where their parents sit
 * (one barycenter pass, with each output's order as a tie-break), which untangles most branches.
 * Positions are the node's top-left corner, so the trigger's centre is at x = width / 2.
 */
export function layout(
  nodes: GNode[],
  edges: GEdge[],
  gap = { x: 320, y: 190 },
  handleOrder: (source: string, handle: string | null | undefined) => number = () => 0,
  /** Where an output sits, from the centre of its step. A lone child sits right under it. */
  handleOffset: (source: string, handle: string | null | undefined) => number = () => 0,
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const rank = new Map<string, number>();
  const all = layers(nodes, edges);
  all.forEach((layer, li) => {
    const parentsAvg = (id: string) => {
      const ranks = edges
        .filter((e) => e.target === id && rank.has(e.source))
        .map((e) => rank.get(e.source)! + handleOrder(e.source, e.sourceHandle) * 0.01);
      return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
    };
    const ordered = li === 0 ? layer : [...layer].sort((a, b) => parentsAvg(a) - parentsAvg(b));
    ordered.forEach((id, i) => {
      rank.set(id, i);
      pos[id] = { x: (i - (ordered.length - 1) / 2) * gap.x, y: li * gap.y };
    });
  });
  // An only child follows its parent: chains stay straight, and a step on one path of a check
  // sits under that path, leaving the other path's "+" clear.
  for (const layer of all.slice(1))
    for (const id of layer) {
      const ins = edges.filter((e) => e.target === id && pos[e.source]);
      if (ins.length !== 1 || edges.filter((e) => e.source === ins[0].source).length !== 1)
        continue;
      pos[id] = {
        ...pos[id],
        x: pos[ins[0].source].x + handleOffset(ins[0].source, ins[0].sourceHandle),
      };
    }
  return pos;
}

/** The ids of the edges along a path of node ids. */
export function pathEdges(path: string[], edges: (GEdge & { id: string })[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const e = edges.find((x) => x.source === path[i - 1] && x.target === path[i]);
    if (e) ids.add(e.id);
  }
  return ids;
}
