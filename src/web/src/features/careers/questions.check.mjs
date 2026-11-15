// Run: node --experimental-strip-types src/features/careers/questions.check.mjs
import assert from 'node:assert/strict';
import {
  answerProblem,
  blankQuestion,
  draftProblem,
  toAnswerInputs,
  toDraft,
  toInput,
} from './questions.ts';

// Drafts: yes or no always has its two answers; blank choices are dropped; knockouts must stay a choice.
const yesNo = toDraft({
  type: 'YesNo',
  label: ' Can you work in the US? ',
  knockoutAnswers: ['No'],
});
assert.deepEqual(toInput(yesNo), {
  id: null,
  type: 'YesNo',
  label: 'Can you work in the US?',
  helpText: null,
  required: false,
  options: ['Yes', 'No'],
  knockoutAnswers: ['No'],
  bankQuestionId: null,
});
const choice = {
  ...blankQuestion('SingleChoice'),
  label: 'Shift',
  options: ['Day', ' ', 'Night'],
  knockoutAnswers: ['Gone'],
};
assert.deepEqual(toInput(choice).options, ['Day', 'Night']);
assert.deepEqual(toInput(choice).knockoutAnswers, []);
assert.equal(draftProblem({ ...choice, options: ['Day', ''] }), 'Add at least two choices.');
assert.equal(
  draftProblem({ ...yesNo, knockoutAnswers: ['Yes', 'No'] }),
  'Leave at least one answer that is not flagged.',
);
assert.equal(draftProblem(blankQuestion('ShortText')), 'Write the question.');
assert.equal(draftProblem(choice), null);

// Answers: required, numbers, dates, links; files by token.
const q = (type, required = true) => ({ id: type, type, label: type, required, options: [] });
assert.equal(answerProblem(q('ShortText'), { values: [' '] }), 'Answer this question.');
assert.equal(answerProblem(q('ShortText', false), { values: [] }), null);
assert.equal(answerProblem(q('Number'), { values: ['1,200.5'] }), null);
assert.equal(answerProblem(q('Number'), { values: ['ten'] }), 'Enter a number.');
assert.equal(answerProblem(q('Date'), { values: ['2027-01-04'] }), null);
assert.equal(
  answerProblem(q('Url'), { values: ['javascript:alert(1)'] }),
  'Paste the full link, starting with https://',
);
assert.equal(answerProblem(q('File'), { values: [] }), 'Add a file.');
assert.equal(answerProblem(q('File'), { values: [], fileToken: 'abc' }), null);

assert.deepEqual(
  toAnswerInputs([q('Number'), q('MultipleChoice'), q('File')], {
    Number: { values: ['1,200'] },
    MultipleChoice: { values: ['A', 'B'] },
    File: { values: [], fileToken: 't' },
  }),
  [
    { questionId: 'Number', values: ['1200'] },
    { questionId: 'MultipleChoice', values: ['A', 'B'] },
    { questionId: 'File', values: [], fileToken: 't' },
  ],
);
console.log('questions ok');
