// Run: node --experimental-strip-types src/features/candidates/candidates.check.mjs
import assert from 'node:assert';
import { pushRecent } from './recent.ts';
import { compareIds, skillOverlap } from './compare.ts';

const at = '2026-01-01T00:00:00Z';
const a = { id: 'a', name: 'A', viewedAt: at };
const b = { id: 'b', name: 'B', viewedAt: at };
assert.deepEqual(
  pushRecent([a, b], { ...b, name: 'B2' }).map((x) => x.name),
  ['B2', 'A'],
);
const many = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  name: String(i),
  viewedAt: at,
}));
assert.equal(pushRecent(many, a).length, 20);
assert.equal(pushRecent(many, a)[0].id, 'a');

const overlap = skillOverlap([
  ['React', 'TypeScript', 'Go'],
  ['react', 'Python', 'TypeScript'],
  ['React', 'python'],
]);
assert.equal(overlap.get('react'), 'all');
assert.equal(overlap.get('typescript'), 'some');
assert.equal(overlap.get('python'), 'some');
assert.equal(overlap.get('go'), undefined);
assert.equal(skillOverlap([['A', 'a']]).get('a'), undefined); // duplicates in one list don't count
assert.deepEqual(compareIds(' a, b,a,,c,d'), ['a', 'b', 'c']);
assert.deepEqual(compareIds(undefined), []);
console.log('candidates ok');
