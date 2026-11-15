// Run: node --experimental-strip-types src/features/assessments/scoring.check.mjs
// The shared scoring spec: AssessmentScoringTests.cs checks the same cases on the server.
import assert from 'node:assert';
import {
  autoPoints,
  bucketOf,
  clock,
  contentProblems,
  duration,
  emptyContent,
  hash,
  integritySummary,
  lineDiff,
  plural,
  promptLine,
  questionProblems,
  scoreBuckets,
} from './scoring.ts';

const base = {
  prompt: 'Q',
  points: 4,
  rubric: '',
  language: '',
  starterCode: '',
  accept: '',
  partialCredit: false,
};
const opts = (correct) =>
  ['a', 'b', 'c'].map((id) => ({ id, text: id, correct: correct.includes(id) }));
const single = { ...base, id: 's', type: 'single', options: opts(['b']) };
const multi = { ...base, id: 'm', type: 'multi', options: opts(['a', 'c']) };
const long = { ...base, id: 'l', type: 'long', points: 10, options: [] };

assert.equal(autoPoints(single, ['b']), 4);
assert.equal(autoPoints(single, ['a']), 0);
assert.equal(autoPoints(multi, ['c', 'a']), 4);
assert.equal(autoPoints(multi, ['a']), 0, 'partial set scores nothing');
assert.equal(autoPoints(multi, ['a', 'b', 'c']), 0, 'extra option scores nothing');
assert.equal(autoPoints(single, undefined), 0);
const partial = { ...multi, partialCredit: true };
assert.equal(autoPoints(partial, ['a']), 2);
assert.equal(autoPoints(partial, ['a', 'b']), 0, 'a wrong pick cancels a right one');
assert.equal(autoPoints(long, ['a']), 0);

assert.deepEqual(questionProblems(single), []);
assert.ok(
  questionProblems({ ...single, options: opts(['a', 'b']) }).includes(
    'Mark exactly one correct answer',
  ),
);
assert.ok(
  questionProblems({ ...multi, options: opts([]) }).includes('Mark at least one correct answer'),
);
assert.ok(
  questionProblems({ ...single, options: [...opts(['a']), { id: 'd', text: ' ', correct: false }] })
    .length,
);
assert.ok(questionProblems({ ...long, prompt: ' ' }).includes('Write the question'));
assert.ok(questionProblems({ ...long, type: 'code' }).includes('Pick a language'));
assert.deepEqual(questionProblems({ ...long, type: 'code', language: 'Python' }), []);

const content = emptyContent();
assert.deepEqual(contentProblems(content), [
  'Question 1: write the question',
  'Question 1: fill in at least two answers and remove empty ones',
  'Question 1: mark exactly one correct answer',
]);
assert.ok(contentProblems({ ...content, sections: [] }).includes('Add at least one question'));
assert.ok(
  contentProblems({ ...content, timed: true, minutes: 2 }).includes(
    'Set the timer between 5 and 600 minutes',
  ),
);
assert.ok(
  !contentProblems({ ...content, timed: false, minutes: 0 }).some((p) =>
    p.startsWith('Set the timer'),
  ),
);

assert.equal(plural(1, 'question'), '1 question');
assert.equal(plural(3, 'question'), '3 questions');
assert.equal(plural(0, 'section'), '0 sections');

assert.equal(hash('abc'), hash('abc'));
assert.notEqual(hash('abc'), hash('abd'));
assert.deepEqual(
  scoreBuckets([10, 49, 50, 65, 89, 90, 100]).map((b) => b.candidates),
  [2, 1, 1, 0, 1, 2],
);
assert.equal(bucketOf(70), '70–79');
assert.equal(bucketOf(45), '0–49');

assert.deepEqual(
  integritySummary([
    { type: 'left', at: '' },
    { type: 'returned', at: '', seconds: 30 },
    { type: 'left', at: '' },
    { type: 'returned', at: '', seconds: 130 },
    { type: 'paste-blocked', at: '' },
  ]),
  ['Left the tab 2 times, longest 2 minutes', 'Tried to paste 1 time'],
);
assert.deepEqual(integritySummary([]), []);
assert.equal(duration(45), '45 seconds');
assert.equal(duration(3900), '1 hour 5 minutes');
assert.equal(clock(65_000), '1:05');
assert.equal(clock(3_725_000), '1:02:05');
assert.equal(clock(-5), '0:00');

assert.deepEqual(
  lineDiff('a\nb\nc', 'a\nx\nc\nd').map((l) => `${l.kind[0]}${l.text}`),
  ['sa', 'rb', 'ax', 'sc', 'ad'],
);
assert.equal(promptLine('## Fix the **bug**\n\nMore'), 'Fix the bug');
console.log('assessment scoring ok');
