// node --experimental-strip-types src/features/pipeline/pipeline-stats.check.mjs
import assert from 'node:assert/strict';
import {
  activeFilterCount,
  averageDaysInStage,
  daysSince,
  matchesFilters,
  NO_FILTERS,
  sortCards,
  timeInStage,
} from './pipeline-stats.ts';

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

// Filters: every one that is set must hold.
const person = (over) => ({
  id: 'x',
  source: 'Indeed',
  rating: 4,
  yearsExperience: 6,
  fitScore: 82,
  skills: ['React', 'Go'],
  tags: ['silver'],
  appliedAt: ago(5),
  lastActivityAt: ago(9),
  flagged: false,
  feedbackOwed: 0,
  assessment: null,
  ...over,
});
const keep = (filters, card = person({})) =>
  matchesFilters(card, { ...NO_FILTERS, ...filters }, now);
assert.equal(keep({}), true, 'no filters keeps everyone');
assert.equal(activeFilterCount({ ...NO_FILTERS, sources: ['a'], flagged: true }), 2);
assert.equal(keep({ sources: ['Indeed', 'LinkedIn'] }), true);
assert.equal(keep({ sources: ['LinkedIn'] }), false);
assert.equal(keep({ minRating: 5 }), false);
assert.equal(keep({ minRating: 4 }), true);
assert.equal(keep({ minYears: 7 }), false);
assert.equal(
  keep({ minYears: 7 }, person({ yearsExperience: undefined })),
  false,
  'unknown years fail a minimum',
);
assert.equal(keep({ minFit: 80 }), true);
assert.equal(
  keep({ minFit: 80 }, person({ fitScore: null })),
  false,
  'no fit check fails a minimum',
);
assert.equal(keep({ skills: ['react'] }), true, 'skills ignore case');
assert.equal(keep({ skills: ['rust', 'go'] }), true, 'any of the skills');
assert.equal(keep({ skills: ['rust'] }), false);
assert.equal(keep({ tags: ['gold'] }), false);
assert.equal(keep({ appliedWithin: 7 }), true);
assert.equal(keep({ appliedWithin: 3 }), false);
assert.equal(keep({ idleDays: 7 }), true);
assert.equal(keep({ idleDays: 14 }), false);
assert.equal(keep({ flagged: true }), false);
assert.equal(keep({ flagged: true }, person({ flagged: true })), true);
assert.equal(keep({ feedbackOwed: true }, person({ feedbackOwed: 2 })), true);
assert.equal(keep({ hasInterview: true }), false);
assert.equal(keep({ assessment: 'none' }), true);
assert.equal(keep({ assessment: 'passed' }, person({ assessment: { decision: 'Passed' } })), true);
assert.equal(keep({ assessment: 'waiting' }, person({ assessment: { decision: null } })), true);
const byFit = [
  person({ id: 'a', fitScore: 50 }),
  person({ id: 'b', fitScore: null }),
  person({ id: 'c', fitScore: 90 }),
];
assert.deepEqual(
  sortCards(byFit, 'fit').map((c) => c.id),
  ['c', 'a', 'b'],
);
assert.deepEqual(
  sortCards(
    [person({ id: 'a', yearsExperience: 2 }), person({ id: 'b', yearsExperience: 9 })],
    'years',
  ).map((c) => c.id),
  ['b', 'a'],
);
console.log('pipeline-stats checks passed');
