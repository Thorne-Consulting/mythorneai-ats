// Run: node --experimental-strip-types src/features/workflows/graph.check.mjs
import assert from 'node:assert';
import { layers, layout, pathEdges } from './graph.ts';

const nodes = [{ id: 't' }, { id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }];
const edges = [
  { id: '1', source: 't', target: 'c' },
  { id: '2', source: 'c', target: 'a', sourceHandle: 'yes' },
  { id: '3', source: 'c', target: 'b', sourceHandle: 'no' },
  { id: '4', source: 'a', target: 'd' },
  { id: '5', source: 'b', target: 'd' },
];

// A diamond lays out top to bottom: one row per step, branches side by side.
assert.deepEqual(layers(nodes, edges), [['t'], ['c'], ['a', 'b'], ['d']]);
const pos = layout(nodes, edges);
assert.equal(pos.t.y, 0);
assert.equal(pos.d.y, 3 * 190);
assert.equal(pos.t.x, 0, 'the trigger is centred');
assert.equal(pos.a.x, -pos.b.x, 'branches sit either side');

// Output order wins a tie: "yes" goes left of "no" even when listed the other way.
const swapped = [edges[0], edges[2], edges[1], edges[3], edges[4]];
const order = (_s, h) => (h === 'no' ? 1 : 0);
const p2 = layout(nodes, swapped, undefined, order);
assert.ok(p2.a.x < p2.b.x);

// A cycle still places every node.
const loop = [...edges, { id: '6', source: 'd', target: 'c' }];
assert.equal(layers(nodes, loop).flat().length, nodes.length);

// A lone child of the No path sits under No; the chain below it stays straight.
const branch = [{ id: 't' }, { id: 'c' }, { id: 'n' }, { id: 'm' }];
const branchEdges = [
  { source: 't', target: 'c' },
  { source: 'c', target: 'n', sourceHandle: 'no' },
  { source: 'n', target: 'm' },
];
const p3 = layout(branch, branchEdges, undefined, undefined, (_s, h) =>
  h === 'no' ? 64 : h === 'yes' ? -64 : 0,
);
assert.equal(p3.n.x, 64);
assert.equal(p3.m.x, 64);

assert.deepEqual([...pathEdges(['t', 'c', 'b', 'd'], edges)], ['1', '3', '5']);
console.log('workflow graph ok');
