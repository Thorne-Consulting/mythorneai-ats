// node --experimental-strip-types src/features/pipeline/pipeline-stats.check.mjs
import assert from 'node:assert/strict';
import { averageDaysInStage, daysSince, sortCards, timeInStage } from './pipeline-stats.ts';

const now = Date.parse('2026-11-13T12:00:00Z');
const ago = (days) => new Date(now - days * 86_400_000).toISOString();

assert.equal(daysSince(ago(0.5), now), 0);
assert.equal(daysSince(ago(3.2), now), 3);
assert.equal(daysSince(ago(-1), now), 0, 'a future time is today');

assert.equal(timeInStage(undefined, 5, now), null);
assert.deepEqual(timeInStage(ago(0), 5, now), {
  days: 0,
  text: 'In stage since today',
  tone: null,
});
assert.deepEqual(timeInStage(ago(1), null, now), { days: 1, text: '1 day in stage', tone: null });
assert.equal(timeInStage(ago(5), 5, now).tone, null, 'at the target is fine');
assert.equal(timeInStage(ago(6), 5, now).tone, 'amber');
assert.equal(timeInStage(ago(11), 5, now).tone, 'red');

const card = (id, entered, rating, applied) => ({
  id,
  enteredStageAt: ago(entered),
  rating,
  appliedAt: ago(applied),
});
const cards = [card('a', 1, 3, 10), card('b', 7, undefined, 20), card('c', 3, 5, 5)];
assert.equal(averageDaysInStage([], now), null);
assert.equal(averageDaysInStage(cards, now), 4);
assert.deepEqual(
  sortCards(cards, 'activity').map((c) => c.id),
  ['a', 'b', 'c'],
);
assert.deepEqual(
  sortCards(cards, 'days').map((c) => c.id),
  ['b', 'c', 'a'],
);
assert.deepEqual(
  sortCards(cards, 'score').map((c) => c.id),
  ['c', 'a', 'b'],
);
assert.deepEqual(
  sortCards(cards, 'applied').map((c) => c.id),
  ['b', 'a', 'c'],
);
console.log('pipeline-stats ok');
