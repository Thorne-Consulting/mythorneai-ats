// Run: node --experimental-strip-types src/features/requisitions/interview-kit-doc.check.mjs
import assert from 'node:assert';
import { parseKit, kitTemplates } from './interview-kit-doc.ts';
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
