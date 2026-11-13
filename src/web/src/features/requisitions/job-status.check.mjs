// Run: node --experimental-strip-types src/features/requisitions/job-status.check.mjs
import assert from 'node:assert';
import { planStatusChange, statusOptions } from './job-status.ts';

assert.deepEqual(statusOptions('PendingApproval'), ['Draft', 'Cancelled']);
assert.ok(!statusOptions('Draft', true).includes('Open'));
assert.ok(statusOptions('Draft').includes('Open'));
assert.ok(!statusOptions('Open').includes('Open'));

const jobs = [
  { id: 'a', status: 'Draft', mine: true },
  { id: 'b', status: 'Open', mine: true },
  { id: 'c', status: 'PendingApproval', mine: true },
  { id: 'd', status: 'Draft', mine: false },
];
const { change, skipped } = planStatusChange(jobs, 'Open', (j) => j.mine);
assert.deepEqual(
  change.map((j) => j.id),
  ['a'],
);
assert.deepEqual(
  skipped.map((j) => j.id),
  ['b', 'c', 'd'],
);
assert.deepEqual(
  planStatusChange(jobs, 'Cancelled', () => true).change.map((j) => j.id),
  ['a', 'b', 'c', 'd'],
);
console.log('job status ok');
