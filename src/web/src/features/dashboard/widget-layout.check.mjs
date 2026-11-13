// Run: node --experimental-strip-types src/features/dashboard/widget-layout.check.mjs
import assert from 'node:assert';
import { WIDGETS, defaultLayout, moveWidget, normalizeLayout } from './widget-layout.ts';

for (const role of ['Admin', 'Recruiter', 'HiringManager'])
  assert.deepEqual([...defaultLayout(role).order].sort(), Object.keys(WIDGETS).sort(), role);

assert.deepEqual(moveWidget(['stats', 'jobs', 'waiting'], 'jobs', -1), [
  'jobs',
  'stats',
  'waiting',
]);
assert.deepEqual(moveWidget(['stats', 'jobs'], 'stats', -1), ['stats', 'jobs']);
assert.deepEqual(moveWidget(['stats', 'jobs'], 'jobs', 1), ['stats', 'jobs']);

const fixed = normalizeLayout(
  { order: ['jobs', 'gone', 'jobs'], hidden: ['gone', 'sources'] },
  'Admin',
);
assert.equal(fixed.order[0], 'jobs');
assert.equal(fixed.order.length, Object.keys(WIDGETS).length);
assert.deepEqual(fixed.hidden, ['sources']);
console.log('widget layout ok');
