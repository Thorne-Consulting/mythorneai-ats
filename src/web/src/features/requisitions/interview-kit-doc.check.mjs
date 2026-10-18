// Run: node --experimental-strip-types src/features/requisitions/interview-kit-doc.check.mjs
import assert from 'node:assert';
import { parseKit, kitTemplates, kitToMarkdown } from './interview-kit-doc.ts';
const k = parseKit(kitTemplates[0].markdown);
assert.equal(k.name, 'Recruiter screen');
assert.equal(k.criteria.length, 4);
assert.equal(k.criteria[3].name, 'Communication');
assert.equal(k.criteria[3].weight, 2);
assert.match(k.criteria[0].question, /^What made you apply.*Follow-up: What would make you/);
assert.match(k.criteria[0].description, /^Gives specific reasons/);
assert.match(k.instructions, /^Suggested length: 30 minutes/);
assert.match(k.candidateMessage, /^Thanks for applying/);
// Every whole-kit template parses to a named kit with 3-5 scored competencies.
for (const template of kitTemplates.slice(0, 6)) {
  const parsed = parseKit(template.markdown);
  assert.equal(parsed.name, template.label);
  assert.ok(parsed.criteria.length >= 3 && parsed.criteria.length <= 5, template.label);
  assert.ok(parsed.instructions && parsed.candidateMessage && parsed.interviewerMessage);
}
// A sub-heading inside a message stays in that message; a competency without a question is dropped.
const m = parseKit(
  '# X\n\n## Candidate booking message\n\nPick.\n\n### Parking\n\nLot B.\n\n## Scorecard\n\n### Empty\n\n### Real\n\nAsk this?',
);
assert.match(m.candidateMessage, /### Parking/);
assert.deepEqual(
  m.criteria.map((c) => c.name),
  ['Real'],
);
console.log('kit parser ok');

// A saved kit survives being written out as a document and read back.
const saved = {
  id: 'kit-1',
  name: 'Writing review',
  instructions: 'Read the sample first.\n\nKeep it to 45 minutes.',
  candidateMessage: 'Pick a time.',
  interviewerMessage: 'You are on this one.',
  durationMinutes: 45,
  criteria: [
    { id: 'c2', name: 'Judgement', question: 'What did you cut?', description: '', weight: 4, sortOrder: 1 },
    { id: 'c1', name: 'Craft', question: 'Proudest of?', description: 'Real decisions.', weight: 2, sortOrder: 0 },
  ],
};
const back = parseKit(kitToMarkdown(saved));
assert.equal(back.name, 'Writing review');
assert.equal(back.instructions, saved.instructions);
assert.equal(back.candidateMessage, 'Pick a time.');
assert.equal(back.interviewerMessage, 'You are on this one.');
assert.deepEqual(
  back.criteria.map((c) => [c.name, c.question, c.description, c.weight]),
  [['Craft', 'Proudest of?', 'Real decisions.', 2], ['Judgement', 'What did you cut?', '', 4]],
);
console.log('kit round trip ok');

// The scorecard table: pipes inside a cell survive, a bad weight falls back to 3.
const tabled = parseKit(`# T

## Scorecard

| Competency | Question to ask | What good looks like | Weight |
| --- | --- | --- | --- |
| Range | Pick one: A \\| B? | Explains why | 5 |
| Depth | Go deeper? |  | x |
|  | No name, dropped |  | 3 |`);
assert.deepEqual(
  tabled.criteria.map((c) => [c.name, c.question, c.description, c.weight]),
  [['Range', 'Pick one: A | B?', 'Explains why', 5], ['Depth', 'Go deeper?', '', 3]],
);
console.log('kit table ok');
