// Run: node --experimental-strip-types src/features/dashboard/fuzzy-match.check.mjs
import assert from 'node:assert';
import { fuzzyScore } from './fuzzy-match.ts';

assert.equal(fuzzyScore('', 'Create job'), 0);
assert.equal(fuzzyScore('xyz', 'Create job'), -1);
assert.ok(fuzzyScore('create', 'Create job') > fuzzyScore('job', 'Create job'));
assert.ok(fuzzyScore('job', 'Create job') > fuzzyScore('cj', 'Create job'));
assert.ok(fuzzyScore('cj', 'Create job') > 0);
assert.ok(fuzzyScore('cj', 'Create job') > fuzzyScore('cj', 'Pick a scorecard job'));
assert.equal(fuzzyScore('jc', 'Create job'), -1);
console.log('fuzzy match ok');
