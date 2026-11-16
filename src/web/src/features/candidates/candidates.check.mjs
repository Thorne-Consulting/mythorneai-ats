// Run: node --experimental-strip-types src/features/candidates/candidates.check.mjs
import assert from 'node:assert';
import { pushRecent } from './recent.ts';
import { compareIds, sameAcross, skillOverlap } from './compare.ts';
import { keyFromLabel } from './custom-field-key.ts';
import { guessKind } from './file-kinds.ts';
import {
  BLANK,
  candidateParams,
  clearChip,
  filterChips,
  sameFilters,
  viewLayout,
  viewParams,
  viewState,
} from './candidate-filters.ts';

const at = '2026-01-01T00:00:00Z';
const a = { id: 'a', name: 'A', viewedAt: at };
const b = { id: 'b', name: 'B', viewedAt: at };
assert.deepEqual(
  pushRecent([a, b], { ...b, name: 'B2' }).map((x) => x.name),
  ['B2', 'A'],
);
const many = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  name: String(i),
  viewedAt: at,
}));
assert.equal(pushRecent(many, a).length, 20);
assert.equal(pushRecent(many, a)[0].id, 'a');

const overlap = skillOverlap([
  ['React', 'TypeScript', 'Go'],
  ['react', 'Python', 'TypeScript'],
  ['React', 'python'],
]);
assert.equal(overlap.get('react'), 'all');
assert.equal(overlap.get('typescript'), 'some');
assert.equal(overlap.get('python'), 'some');
assert.equal(overlap.get('go'), undefined);
assert.equal(skillOverlap([['A', 'a']]).get('a'), undefined); // duplicates in one list don't count
assert.deepEqual(compareIds(' a, b,a,,c,d,e'), ['a', 'b', 'c', 'd']);
assert.deepEqual(compareIds(undefined), []);
// Custom field keys come from the label and stay unique.
assert.equal(keyFromLabel('Notice period (weeks)', []), 'notice-period-weeks');
assert.equal(keyFromLabel('Notice period', ['notice-period']), 'notice-period-2');
assert.equal(keyFromLabel('  ', []), 'field');
assert.equal(keyFromLabel('Café visa?', []), 'cafe-visa');

// Uploads: a cover letter is never read as the resume.
assert.equal(guessKind('Jane Cover Letter.pdf', false), 'CoverLetter');
assert.equal(guessKind('jane-cv.docx', true), 'Resume');
assert.equal(guessKind('jane.pdf', false), 'Resume');
assert.equal(guessKind('jane.pdf', true), 'Other');

// Filters: chips, clearing one, the API query and old saved views.
const filters = {
  ...BLANK,
  status: 'Rejected',
  skills: ['react', 'go'],
  skillMode: 'all',
  minYears: 3,
};
assert.deepEqual(
  filterChips(filters).map((chip) => chip.label),
  ['Skills: react and go', '3 years of experience or more'],
);
assert.deepEqual(clearChip('skills'), { skills: [], skillMode: 'any' });
const params = candidateParams({ ...BLANK, hasApplications: false, tags: ['a', 'b'] }, 2);
assert.equal(params.get('hasApplications'), 'false');
assert.equal(params.get('tags'), 'a,b');
assert.equal(params.get('page'), '2');
assert.ok(sameFilters({ ...BLANK, tags: ['b', 'a'] }, { ...BLANK, tags: ['a', 'b'] }));
assert.equal(viewState('{"filters":{"minYears":"","skills":["x"]}}').filters.minYears, null);
assert.equal(viewState('{"jobId":"j","minYears":4}').filters.minYears, 4);
assert.equal(viewState('not json').filters.search, '');

console.log('candidates ok');

// Compare: "Show only differences" hides rows that read the same for everyone.
assert.equal(sameAcross(['Yes', 'Yes', 'Yes']), true);
assert.equal(sameAcross(['Yes', 'No']), false);
assert.equal(sameAcross(['Yes']), false);

// Pools and views: the pool narrows the list query; a view stores the query for its count.
{
  const params = candidateParams({ ...BLANK, poolId: 'p1', skills: ['react'] });
  assert.equal(params.get('poolId'), 'p1');
  const stored = JSON.parse(viewParams({ ...BLANK, skills: ['react'] }, '', null));
  assert.equal(stored.listQuery, 'skills=react&skillMode=any');
  assert.equal(
    viewLayout(JSON.stringify({ layout: { hidden: ['tags'], density: 'compact', sort: null } }))
      ?.density,
    'compact',
  );
  assert.equal(viewLayout('{}'), null);
  // Key order does not make two filter sets differ.
  const { search, ...rest } = BLANK;
  assert.equal(sameFilters({ ...rest, search }, BLANK), true);
}

// Stage type and answers: the dashboard link, an answer filter and its chip, clearing both.
{
  const f = {
    ...BLANK,
    jobId: 'j1',
    stageType: 'Interview',
    openJobs: true,
    questionId: 'q1',
    answers: ['No', 'Maybe'],
    flagged: true,
  };
  const params = candidateParams(f);
  assert.equal(params.get('stageType'), 'Interview');
  assert.equal(params.get('openJobs'), 'true');
  assert.equal(params.get('questionId'), 'q1');
  assert.deepEqual(params.getAll('answer'), ['No', 'Maybe']);
  assert.equal(params.get('flagged'), 'true');
  assert.deepEqual(
    filterChips(f, {}, 'Can you work in the US?').map((chip) => chip.label),
    [
      'Stage type: Interview',
      'Open jobs only',
      'Can you work in the US?: No or Maybe',
      'Flagged answers only',
    ],
  );
  assert.deepEqual(clearChip('questionId'), { questionId: null, answers: [] });
  // Without a job, the toolbar shows the stage type, so no chip repeats it.
  assert.deepEqual(filterChips({ ...BLANK, stageType: 'Offer' }), []);
  // Answers without a question mean nothing, so they are not sent.
  assert.equal(candidateParams({ ...BLANK, answers: ['No'] }).has('answer'), false);
  assert.ok(sameFilters({ ...BLANK, answers: ['b', 'a'] }, { ...BLANK, answers: ['a', 'b'] }));
}
console.log('stage type and answer filters ok');
