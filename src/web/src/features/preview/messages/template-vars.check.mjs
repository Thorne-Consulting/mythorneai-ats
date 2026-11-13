// Run: node --experimental-strip-types src/features/preview/messages/template-vars.check.mjs
import assert from 'node:assert';
import { candidateValues, fillTemplate, variablesIn } from './template-vars.ts';

const values = candidateValues({
  name: 'Karen Dela Cruz',
  role: 'Software Engineer',
  stage: 'Interview',
});
assert.equal(values.first_name, 'Karen');
assert.equal(values.last_name, 'Dela Cruz');
assert.equal(values.interview_time, undefined);

assert.deepEqual(fillTemplate('Hi {{first_name}}, re {{ job_title }}.', values), {
  text: 'Hi Karen, re Software Engineer.',
  missing: [],
});
assert.deepEqual(fillTemplate('See you {{interview_time}} {{interview_time}} {{nope}}', values), {
  text: 'See you {{interview_time}} {{interview_time}} {{nope}}',
  missing: ['interview_time', 'nope'],
});
assert.deepEqual(fillTemplate('No vars', values), { text: 'No vars', missing: [] });
assert.deepEqual(variablesIn('{{a_b}} x {{c}} {{a_b}} {{Bad}}'), ['a_b', 'c']);
console.log('template vars ok');
