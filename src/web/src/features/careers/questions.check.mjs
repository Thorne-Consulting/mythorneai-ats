// Run: node --experimental-strip-types src/features/careers/questions.check.mjs
import assert from 'node:assert';
import { formatAnswers, parseQuestions } from './questions.ts';

assert.deepEqual(parseQuestions(''), []);
assert.deepEqual(parseQuestions(null), []);
assert.deepEqual(
  parseQuestions('Tell us a bit.\n\n- Why this role?\n- **Notice period** (required)\n1. Salary *'),
  [
    { text: 'Why this role?', required: false },
    { text: 'Notice period', required: true },
    { text: 'Salary', required: true },
  ],
);
assert.deepEqual(parseQuestions('- **Bold question**'), [
  { text: 'Bold question', required: false },
]);
assert.deepEqual(parseQuestions('Intro line.\nWhy us?\nWhen can you start? *'), [
  { text: 'Why us?', required: false },
  { text: 'When can you start?', required: true },
]);
assert.deepEqual(
  parseQuestions('## Heading\n\nDescribe a project you led.\n\nLink your portfolio.'),
  [
    { text: 'Describe a project you led.', required: false },
    { text: 'Link your portfolio.', required: false },
  ],
);
assert.equal(
  formatAnswers(
    [
      { text: 'A?', required: false },
      { text: 'B?', required: false },
    ],
    ['yes ', ''],
  ),
  '### A?\n\nyes\n\n### B?\n\n_No answer_',
);
console.log('questions ok');
