// Run: node --experimental-strip-types src/features/preview/workflows/graph.check.mjs
import assert from 'node:assert';
import { compare, findCycle, layers, layout, runPath, validate } from './graph.ts';

const yesNo = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];
const nodes = [
  { id: 't', label: 'Stage entered', trigger: true },
  { id: 'c', label: 'Rating', branches: yesNo },
  { id: 'a', label: 'Email' },
  { id: 'b', label: 'Tag' },
  { id: 'd', label: 'Notify' },
];
const edges = [
  { source: 't', target: 'c' },
  { source: 'c', target: 'a', sourceHandle: 'yes' },
  { source: 'c', target: 'b', sourceHandle: 'no' },
  { source: 'a', target: 'd' },
  { source: 'b', target: 'd' },
];

// A valid diamond.
assert.deepEqual(validate(nodes, edges), []);
assert.equal(findCycle(nodes, edges), null);
assert.deepEqual(layers(nodes, edges), [['t'], ['c'], ['a', 'b'], ['d']]);
const pos = layout(nodes, edges);
assert.equal(pos.d.x, 900);
assert.equal(pos.a.y, -pos.b.y);

// Missing branch, orphan, second trigger, cycle.
const broken = validate(
  [...nodes, { id: 'o', label: 'Webhook' }, { id: 't2', label: 'Offer accepted', trigger: true }],
  edges.filter((e) => e.sourceHandle !== 'no'),
);
const text = broken.map((p) => p.message).join('\n');
assert.match(text, /exactly one trigger/);
assert.match(text, /no “No” branch/);
assert.match(text, /not connected to the trigger: Tag, Webhook/);

const loop = [...edges, { source: 'd', target: 'c' }];
assert.deepEqual(findCycle(nodes, loop), ['c', 'a', 'd']);
assert.ok(validate(nodes, loop).some((p) => /loop back/.test(p.message)));
assert.equal(layers(nodes, loop).flat().length, nodes.length, 'cyclic nodes still placed');
assert.match(
  validate([], [])
    .map((p) => p.message)
    .join(),
  /Add a trigger/,
);

// Simulated run follows the chosen branch and stops before repeating a step.
assert.deepEqual(
  runPath(nodes, edges, (id) => (id === 'c' ? 'no' : null)),
  ['t', 'c', 'b', 'd'],
);
assert.deepEqual(
  runPath(nodes, loop, (id) => (id === 'c' ? 'yes' : null)),
  ['t', 'c', 'a', 'd'],
);

assert.ok(compare('4', 'greater than', '3'));
assert.ok(!compare('LinkedIn', 'is', 'referral'));
assert.ok(compare('Senior, Remote', 'contains', 'remote'));
console.log('workflow graph ok');
