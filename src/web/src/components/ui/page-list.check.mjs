// Run: node --experimental-strip-types src/components/ui/page-list.check.mjs
import assert from 'node:assert';
import { pageList } from './page-list.ts';

assert.deepEqual(pageList(1, 1), [1]);
assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(pageList(1, 20), [1, 2, '…', 20]);
assert.deepEqual(pageList(10, 20), [1, '…', 9, 10, 11, '…', 20]);
assert.deepEqual(pageList(20, 20), [1, '…', 19, 20]);
assert.deepEqual(pageList(3, 20), [1, 2, 3, 4, '…', 20]);
console.log('page list ok');
