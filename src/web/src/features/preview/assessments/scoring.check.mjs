// Run: node --experimental-strip-types src/features/preview/assessments/scoring.check.mjs
import assert from 'node:assert';
import { autoPoints, hash, questionProblems, scoreBuckets, scoreSubmission } from './scoring.ts';

const base = { prompt: 'Q', points: 4, rubric: '', language: '', starterCode: '', accept: '' };
const opts = (correct) =>
  ['a', 'b', 'c'].map((id) => ({ id, text: id, correct: correct.includes(id) }));
const single = { ...base, id: 's', type: 'single', options: opts(['b']) };
const multi = { ...base, id: 'm', type: 'multi', options: opts(['a', 'c']) };
const long = { ...base, id: 'l', type: 'long', points: 10, options: [] };
const ans = (choice) => ({ choice, text: '', file: '' });

assert.equal(autoPoints(single, ans(['b'])), 4);
assert.equal(autoPoints(single, ans(['a'])), 0);
assert.equal(autoPoints(multi, ans(['c', 'a'])), 4);
assert.equal(autoPoints(multi, ans(['a'])), 0, 'partial set scores nothing');
assert.equal(autoPoints(multi, ans(['a', 'b', 'c'])), 0, 'extra option scores nothing');
assert.equal(autoPoints(single, undefined), 0);

const qs = [single, multi, long];
const answers = { s: ans(['b']), m: ans(['a']) };
assert.deepEqual(scoreSubmission(qs, answers, {}), {
  earned: 4,
  total: 18,
  pending: 1,
  percent: null,
});
assert.deepEqual(scoreSubmission(qs, answers, { l: 7 }), {
  earned: 11,
  total: 18,
  pending: 0,
  percent: 61,
});
assert.equal(
  scoreSubmission(qs, answers, { l: 99 }).earned,
  14,
  'review capped at question points',
);

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

assert.equal(hash('abc'), hash('abc'));
assert.notEqual(hash('abc'), hash('abd'));
assert.deepEqual(
  scoreBuckets([10, 49, 50, 65, 89, 90, 100]).map((b) => b.candidates),
  [2, 1, 1, 0, 1, 2],
);
console.log('assessment scoring ok');
