// Run: node --experimental-strip-types src/features/requisitions/job-status.check.mjs
import assert from 'node:assert';
import { daysOpen, planStatusChange, primaryAction, statusOptions } from './job-status.ts';

// Status menu
assert.deepEqual(statusOptions({ status: 'PendingApproval' }), ['Draft', 'Cancelled']);
assert.ok(!statusOptions({ status: 'Draft' }, true).includes('Open'));
assert.ok(statusOptions({ status: 'Draft' }).includes('Open'));
// A job that was approved and opened once can open again without a new approval.
assert.ok(statusOptions({ status: 'Draft', openedAt: '2026-01-01' }, true).includes('Open'));
assert.ok(!statusOptions({ status: 'OnHold' }, true).includes('Open'));
assert.ok(!statusOptions({ status: 'Open' }).includes('Open'));

// Header button
assert.equal(primaryAction({ status: 'Draft' }, true), 'submit');
assert.equal(primaryAction({ status: 'Draft' }, false), 'open');
assert.equal(primaryAction({ status: 'Draft', openedAt: '2026-01-01' }, true), 'open');
assert.equal(primaryAction({ status: 'Open' }), 'find');
assert.equal(primaryAction({ status: 'PendingApproval' }), null);
assert.equal(primaryAction({ status: 'Closed', openedAt: '2026-01-01' }, true), 'reopen');
assert.equal(primaryAction({ status: 'OnHold' }, true), null);

// Days open
const now = Date.parse('2026-11-13T12:00:00Z');
assert.equal(daysOpen({ status: 'Draft' }, now), null);
assert.equal(daysOpen({ status: 'Open', openedAt: '2026-11-01T12:00:00Z' }, now), 12);
assert.equal(
  daysOpen(
    { status: 'Closed', openedAt: '2026-11-01T12:00:00Z', closedAt: '2026-11-04T13:00:00Z' },
    now,
  ),
  3,
);
// Filled by a hire before close dates were kept: counts to the last update.
assert.equal(
  daysOpen(
    { status: 'Filled', openedAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-06T12:00:00Z' },
    now,
  ),
  5,
);

// Bulk change
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
  planStatusChange(jobs, 'Open', (j) => j.mine, true).change.map((j) => j.id),
  [],
);
assert.deepEqual(
  planStatusChange(jobs, 'Cancelled', () => true).change.map((j) => j.id),
  ['a', 'b', 'c', 'd'],
);
console.log('job status ok');
