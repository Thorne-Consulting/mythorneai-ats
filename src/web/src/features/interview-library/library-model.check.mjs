// Run: node --experimental-strip-types src/features/interview-library/library-model.check.mjs
import assert from 'node:assert';
import {
  blankDraft,
  competencyFromQuestion,
  draftFromKit,
  draftFromTemplate,
  move,
  sameDraft,
  searchQuestions,
  splitFollowUp,
  tagsOf,
  toKitBody,
  toTemplateBody,
  validateKit,
} from './library-model.ts';

// A blank kit is not ready: no name, and its one competency is empty. Errors sit on the fields.
const blank = blankDraft();
const empty = validateKit(blank);
assert.equal(empty.ok, false);
assert.equal(empty.name, 'Give the kit a name');
const key = blank.criteria[0].key;
assert.equal(empty.items[key].name, 'Name the competency');
assert.equal(empty.items[key].question, 'Write the question to ask');

// Two competencies with the same name (any case) are flagged on the second, not dropped.
const twice = {
  ...blank,
  name: 'Panel',
  criteria: [
    { ...blank.criteria[0], name: 'Craft', question: 'Show us?' },
    { key: 'b', name: ' craft ', question: 'Again?', followUps: '', description: '', weight: 3 },
  ],
};
const dup = validateKit(twice);
assert.equal(dup.ok, false);
assert.equal(dup.items.b.name, 'Another competency has this name');
assert.equal(dup.items[key], undefined);
assert.equal(validateKit({ ...twice, durationMinutes: 10 }).duration, 'Choose 15 to 480 minutes');

// A saved kit keeps its competency ids through a rename, and the body carries them back.
const kit = {
  id: 'k',
  name: 'Skills',
  instructions: 'Be kind.',
  durationMinutes: 60,
  version: 2,
  interviews: 1,
  updatedAt: '2026-01-01',
  criteria: [
    { id: 'c1', name: 'Craft', question: 'Q1', followUps: '', description: '', weight: 3 },
    { id: 'c2', name: 'Judgement', question: 'Q2', followUps: 'F', description: 'G', weight: 4 },
  ],
};
const draft = draftFromKit(kit);
assert.ok(sameDraft(draft, draftFromKit(kit)));
const renamed = { ...draft, criteria: move(draft.criteria, 1, 0) };
renamed.criteria[0] = { ...renamed.criteria[0], name: 'Judgement calls' };
assert.ok(!sameDraft(draft, renamed));
const body = toKitBody(renamed);
assert.deepEqual(
  body.criteria.map((c) => [c.id, c.name]),
  [
    ['c2', 'Judgement calls'],
    ['c1', 'Craft'],
  ],
);
assert.ok(validateKit(renamed).ok);
// A picture without a description in the instructions blocks saving (the editor passes imageProblem).
const pictured = validateKit(renamed, 'Describe the picture before you save.');
assert.equal(pictured.ok, false);
assert.equal(pictured.instructions, 'Describe the picture before you save.');

// A template becomes new competencies (no ids), and a kit saved as a template drops its ids.
const template = draftFromTemplate(
  {
    name: 'Screen',
    summary: '',
    durationMinutes: 30,
    instructions: 'I',
    competencies: kit.criteria,
    id: 't',
    updatedAt: '',
  },
  'stage-1',
);
assert.equal(template.pipelineStageId, 'stage-1');
assert.ok(template.criteria.every((c) => c.id === undefined && c.key));
const asTemplate = toTemplateBody(draft, ' Short ');
assert.equal(asTemplate.summary, 'Short');
assert.ok(asTemplate.competencies.every((c) => !('id' in c)));
assert.ok(!('pipelineStageId' in asTemplate));

// Question bank search: every word must match somewhere, tags filter exactly.
const bank = [
  {
    id: '1',
    name: 'Problem solving',
    question: 'Talk through it',
    followUps: '',
    goodLooksLike: 'Breaks it down',
    weight: 5,
    tags: ['Technical'],
    updatedAt: '',
  },
  {
    id: '2',
    name: 'Collaboration',
    question: 'A disagreement?',
    followUps: '',
    goodLooksLike: '',
    weight: 4,
    tags: ['Teamwork'],
    updatedAt: '',
  },
];
assert.deepEqual(
  searchQuestions(bank, 'problem down').map((x) => x.id),
  ['1'],
);
assert.deepEqual(
  searchQuestions(bank, 'teamwork').map((x) => x.id),
  ['2'],
);
assert.deepEqual(
  searchQuestions(bank, '', 'Technical').map((x) => x.id),
  ['1'],
);
assert.deepEqual(searchQuestions(bank, 'nothing like this').length, 0);
assert.deepEqual(tagsOf(bank), ['Teamwork', 'Technical']);
const inserted = competencyFromQuestion(bank[0]);
assert.equal(inserted.id, undefined);
assert.equal(inserted.description, 'Breaks it down');

assert.deepEqual(move([1, 2, 3], 0, 2), [2, 3, 1]);
assert.deepEqual(move([1, 2, 3], 0, -1), [1, 2, 3]);
// Old kits kept the follow-up inside the question; it reads back in its own field.
const legacy = splitFollowUp({ question: 'Why us? Follow-up: Why now?', followUps: '' });
assert.deepEqual([legacy.question, legacy.followUps], ['Why us?', 'Why now?']);
assert.equal(splitFollowUp({ question: 'Plain?', followUps: '' }).question, 'Plain?');
console.log('library model ok');
