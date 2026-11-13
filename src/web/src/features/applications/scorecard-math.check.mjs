// Run: node --experimental-strip-types src/features/applications/scorecard-math.check.mjs
import assert from 'node:assert';
import { criterionAverage, oneDecimal, weightedScore } from './scorecard-math.ts';

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
assert.equal(weightedScore(card(3, 5, 1), []), 3); // no kit: overall rating
assert.equal(weightedScore(card(2, 4, 4), [{ id: 'a', weight: 0 }]), 2); // zero weight: overall
assert.equal(criterionAverage([card(1, 5, 1), card(1, 2, 1)], 'a'), 3.5);
assert.equal(criterionAverage([card(1, 5, 1)], 'missing'), null);
assert.equal(oneDecimal(3.25), '3.3');
console.log('scorecard math ok');
