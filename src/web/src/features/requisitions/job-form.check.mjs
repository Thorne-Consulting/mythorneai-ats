// node --experimental-strip-types src/features/requisitions/job-form.check.mjs
import assert from 'node:assert/strict';
import { toDraft, toInput } from '../careers/questions.ts';
import {
  EMPTY_PAY,
  EMPTY_PLACE,
  INITIAL_FORM,
  composeDescription,
  createPayload,
  locationText,
  payProblem,
  payText,
  validateForm,
} from './job-form.ts';

assert.equal(
  locationText({ ...EMPTY_PLACE, city: 'Chicago', region: 'Illinois' }, 'Hybrid'),
  'Chicago, Illinois',
);
assert.equal(
  locationText({ ...EMPTY_PLACE, country: 'DE' }, 'Remote', () => 'Germany'),
  'Germany',
);
assert.equal(locationText(EMPTY_PLACE, 'Remote'), 'Remote');
assert.equal(locationText(EMPTY_PLACE, 'On-site'), '');

assert.equal(payText({ ...EMPTY_PAY, min: 90000, max: 120000 }), 'USD 90,000 – 120,000 a year');
assert.equal(payText({ ...EMPTY_PAY, min: 30, max: 30, period: 'Hour' }), 'USD 30 an hour');
assert.equal(payText(EMPTY_PAY), null);

assert.equal(
  payProblem({ ...EMPTY_PAY, min: 5, max: 1 }),
  'The lowest pay should not be more than the highest.',
);
assert.equal(payProblem({ ...EMPTY_PAY, show: true }), 'Enter the pay range to show it.');
assert.equal(payProblem({ ...EMPTY_PAY, min: 1, max: 5, show: true }), null);

assert.equal(
  composeDescription({ intro: ' We help. ', role: '', benefits: '- Leave' }),
  'We help.\n\n- Leave',
);

// Empty form: every required field says what to do.
assert.deepEqual(Object.keys(validateForm(INITIAL_FORM)).sort(), [
  'department',
  'location',
  'members',
  'title',
]);

const form = {
  ...INITIAL_FORM,
  startFrom: 'template',
  templateId: 't1',
  pipelineTemplateId: 'p1',
  title: ' Support lead ',
  department: 'Support',
  workMode: 'Remote',
  place: { city: '', region: '', country: '', remoteCountries: ['US', 'CA'] },
  pay: { min: 50000, max: '', currency: 'USD', period: 'Year', show: true },
  intro: 'We help.',
  role: 'You lead.',
  benefits: '',
  members: [{ userId: 'u1', role: 'HiringManager' }],
  questions: [toDraft({ type: 'YesNo', label: 'Weekends?', knockoutAnswers: ['No'] })],
  after: 'open',
};
assert.deepEqual(validateForm(form), {});
const body = createPayload(form, toInput);
assert.equal(body.title, 'Support lead');
assert.equal(body.location, 'Remote');
assert.equal(body.description, 'We help.\n\nYou lead.');
assert.equal(body.postingTemplateId, 't1');
assert.equal(body.pipelineTemplateId, 'p1');
assert.equal(body.copyFromId, null);
assert.deepEqual(body.place, {
  city: null,
  region: null,
  country: null,
  remoteCountries: ['US', 'CA'],
});
assert.deepEqual(body.salary, {
  min: 50000,
  max: null,
  currency: 'USD',
  period: 'Year',
  show: true,
});
assert.deepEqual(body.members, [{ userId: 'u1', role: 'HiringManager' }]);
assert.equal(body.questions[0].knockoutAnswers[0], 'No');
assert.equal(body.ownerEmail, null);

// Starting from a job: its stages come with it, so no pipeline is sent; on-site jobs keep no remote countries.
const copied = createPayload(
  {
    ...form,
    startFrom: 'job',
    copyFromId: 'j1',
    workMode: 'On-site',
    place: { city: 'Chicago', region: 'Illinois', country: 'US', remoteCountries: ['US'] },
  },
  toInput,
);
assert.equal(copied.copyFromId, 'j1');
assert.equal(copied.pipelineTemplateId, null);
assert.equal(copied.postingTemplateId, null);
assert.equal(copied.location, 'Chicago, Illinois');
assert.deepEqual(copied.place.remoteCountries, []);
console.log('job-form ok');

// Drafts: an old or partial draft comes back as a whole form.
{
  const { restoreDraft } = await import('./job-form.ts');
  const back = restoreDraft({
    form: { title: 'Nurse', pay: { min: 50 } },
    reqs: { required: ['RN'] },
  });
  assert.equal(back.form.title, 'Nurse');
  assert.equal(back.form.workMode, INITIAL_FORM.workMode);
  assert.equal(back.form.pay.min, 50);
  assert.equal(back.form.pay.currency, 'USD');
  assert.deepEqual(back.form.place, EMPTY_PLACE);
  assert.deepEqual(back.reqs, { required: ['RN'], preferred: [], minYears: '' });
  assert.equal(back.copyStages, null);
  assert.deepEqual(restoreDraft(null).form, INITIAL_FORM);
  console.log('job drafts ok');
}
