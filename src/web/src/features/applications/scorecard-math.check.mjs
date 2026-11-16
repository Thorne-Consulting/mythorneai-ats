// Run: node --experimental-strip-types src/features/applications/scorecard-math.check.mjs
import assert from 'node:assert';
import {
  competencyGrid,
  criterionAverage,
  daysSince,
  oneDecimal,
  scoreTone,
  tallyText,
  weightedScore,
} from './scorecard-math.ts';

const kit = [
  { id: 'a', weight: 3 },
  { id: 'b', weight: 1 },
];
const card = (rating, a, b) => ({
  rating,
  criteria: [
    { criterionId: 'a', rating: a },
    { criterionId: 'b', rating: b },
  ],
});
assert.equal(weightedScore(card(1, 5, 1), kit), 4); // (15 + 1) / 4
assert.equal(weightedScore(card(3, 5, 1), []), 3); // no kit: the card's own number
assert.equal(weightedScore(card(2, 4, 4), [{ id: 'a', weight: 0 }]), 2); // zero weight: same
assert.equal(criterionAverage([card(1, 5, 1), card(1, 2, 1)], 'a'), 3.5);
assert.equal(criterionAverage([card(1, 5, 1)], 'missing'), null);
assert.equal(oneDecimal(3.25), '3.3');

assert.equal(tallyText(['Yes', 'StrongYes', 'StrongYes']), '2 Strong yes · 1 Yes');
assert.equal(tallyText([]), '');
assert.equal(tallyText(['Mixed', 'No']), '1 No · 1 Mixed'); // old scorecards still count

assert.equal(scoreTone(1), 'red');
assert.equal(scoreTone(2.4), 'red');
assert.equal(scoreTone(3), 'amber');
assert.equal(scoreTone(3.5), 'green');

const now = Date.parse('2026-11-13T12:00:00Z');
assert.equal(daysSince('2026-11-10T13:00:00Z', now), 2);
assert.equal(daysSince('2026-11-14T00:00:00Z', now), 0);

// Two interviews, two kits: "Craft" appears in both, "Values" only in the second.
const grid = competencyGrid([
  {
    id: 'i1',
    criteria: [{ id: 'c1', name: 'Craft' }],
    scorecards: [{ criteria: [{ criterionId: 'c1', rating: 4 }] }],
  },
  {
    id: 'i2',
    criteria: [
      { id: 'c2', name: 'Craft' },
      { id: 'c3', name: 'Values' },
    ],
    scorecards: [
      {
        criteria: [
          { criterionId: 'c2', rating: 2 },
          { criterionId: 'c3', rating: 5 },
        ],
      },
      {
        criteria: [
          { criterionId: 'c2', rating: 4 },
          { criterionId: 'c3', rating: 5 },
        ],
      },
    ],
  },
]);
assert.deepEqual(grid[0], { name: 'Craft', cells: [4, 3], average: 3.5 });
assert.deepEqual(grid[1], { name: 'Values', cells: [null, 5], average: 5 });
console.log('scorecard math ok');
