// Run: node --experimental-strip-types src/features/messages/bulk-recipients.check.mjs
import assert from 'node:assert/strict';
import { bulkRecipients } from './bulk-recipients.ts';

// Each entry point sends exactly its own kind of selection, and nothing else.
assert.deepEqual(bulkRecipients({ applicationIds: ['a1', 'a2'] }), {
  applicationIds: ['a1', 'a2'],
  candidateIds: [],
  filter: null,
  poolId: null,
});
assert.deepEqual(bulkRecipients({ candidateIds: ['c1'] }).candidateIds, ['c1']);
// "Everyone matching" and a whole pool reach the server too (the send once dropped them).
assert.equal(bulkRecipients({ filter: 'q=design&page=1' }).filter, 'q=design&page=1');
assert.equal(bulkRecipients({ poolId: 'p1' }).poolId, 'p1');
assert.deepEqual(bulkRecipients({ poolId: 'p1' }).applicationIds, []);
console.log('bulk-recipients: ok');
