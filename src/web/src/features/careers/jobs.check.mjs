// node --experimental-strip-types src/features/careers/jobs.check.mjs
import assert from 'node:assert/strict';
import {
  addressOf,
  descriptionHtml,
  employmentTypeLd,
  idFromParam,
  jobPath,
  jobPostingLd,
  ldJson,
  metaParts,
  plainText,
  postedText,
} from './jobs.ts';

const id = 'c8d2451a-7807-4c63-a8c3-4f63653dcc15';
assert.equal(jobPath({ id, title: 'Product designer' }), `/careers/product-designer-${id}`);
assert.equal(jobPath({ id, title: 'Café & Résumé lead!' }), `/careers/cafe-resume-lead-${id}`);
assert.equal(jobPath({ id, title: '***' }), `/careers/${id}`);
assert.equal(idFromParam(`product-designer-${id}`), id);
assert.equal(idFromParam(id.toUpperCase()), id);
assert.equal(idFromParam('product-designer'), null);

const now = new Date('2026-11-13T12:00:00Z');
assert.equal(postedText('2026-11-13T08:00:00Z', now), 'Posted today');
assert.equal(postedText('2026-11-12T08:00:00Z', now), 'Posted yesterday');
assert.equal(postedText('2026-11-10T08:00:00Z', now), 'Posted 3 days ago');
assert.equal(postedText('2026-10-30T08:00:00Z', now), 'Posted 2 weeks ago');
assert.equal(postedText('2026-09-03T12:00:00Z', now), 'Posted Sep 3');
assert.equal(postedText('2025-09-03T12:00:00Z', now), 'Posted Sep 3, 2025');
assert.equal(postedText(null, now), null);

assert.deepEqual(
  metaParts({ location: 'Boston, MA', workMode: 'Hybrid', employmentType: 'Full time' }),
  ['Boston, MA', 'Hybrid', 'Full time'],
);
// "Remote, US" already says remote.
assert.deepEqual(
  metaParts({ location: 'Remote, US', workMode: 'Remote', employmentType: 'Full time' }),
  ['Remote, US', 'Full time'],
);
assert.deepEqual(metaParts({ location: 'Austin, TX', workMode: 'onsite', employmentType: '' }), [
  'Austin, TX',
  'On-site',
]);

assert.equal(
  plainText('## About\n\n**Build** the [board](https://x.y).\n\n- one\n- two'),
  'About Build the board . one two'.replace(' .', '.'),
);
assert.ok(plainText('word '.repeat(80)).length <= 155);
assert.ok(plainText('word '.repeat(80)).endsWith('…'));

assert.equal(
  descriptionHtml('Hello <b>\nworld\n\n- a\n- b'),
  '<p>Hello &lt;b&gt;<br>world</p><ul><li>a</li><li>b</li></ul>',
);
assert.equal(employmentTypeLd('Full time'), 'FULL_TIME');
assert.equal(employmentTypeLd('Part-time'), 'PART_TIME');
assert.equal(employmentTypeLd('Seasonal'), 'OTHER');
assert.deepEqual(addressOf('Boston, MA'), {
  '@type': 'PostalAddress',
  addressLocality: 'Boston',
  addressRegion: 'MA',
  addressCountry: 'US',
});

const site = {
  company: 'Acme',
  url: `https://jobs.acme.test/careers/x-${id}`,
  origin: 'https://jobs.acme.test',
};
const office = jobPostingLd(
  {
    id,
    title: 'Designer',
    department: 'Design',
    location: 'New York, NY',
    workMode: 'Hybrid',
    employmentType: 'Full time',
    postedAt: '2026-11-03T10:00:00Z',
    code: 'PRG-1',
    description: 'Hi',
  },
  site,
);
assert.equal(office.datePosted, '2026-11-03');
assert.equal(office.jobLocation.address.addressRegion, 'NY');
assert.equal(office.identifier.value, 'PRG-1');
assert.equal(office.directApply, true);
const remote = jobPostingLd(
  {
    id,
    title: 'Engineer',
    department: 'Eng',
    location: 'Remote, US',
    workMode: 'Remote',
    employmentType: 'Full time',
  },
  site,
);
assert.equal(remote.jobLocationType, 'TELECOMMUTE');
assert.equal(remote.applicantLocationRequirements.name, 'US');
assert.equal(remote.jobLocation, undefined);
assert.ok(!ldJson({ a: '</script>' }).includes('</script>'));
// Structured place and pay from the job's own fields.
const job = { id, title: 'Analyst', department: 'Data', employmentType: 'Full time' };
const placed = jobPostingLd(
  {
    ...job,
    workMode: 'Hybrid',
    location: 'Chicago',
    place: { city: 'Chicago', region: 'IL', country: 'US', remoteCountries: [] },
    salary: { min: 90000, max: 120000, currency: 'USD', period: 'Year' },
  },
  site,
);
assert.deepEqual(placed.jobLocation.address, {
  '@type': 'PostalAddress',
  addressLocality: 'Chicago',
  addressRegion: 'IL',
  addressCountry: 'US',
});
assert.deepEqual(placed.baseSalary, {
  '@type': 'MonetaryAmount',
  currency: 'USD',
  value: { '@type': 'QuantitativeValue', unitText: 'YEAR', minValue: 90000, maxValue: 120000 },
});
const anywhere = jobPostingLd(
  {
    ...job,
    workMode: 'Remote',
    place: { city: null, region: null, country: null, remoteCountries: ['US', 'CA'] },
  },
  site,
);
assert.equal(anywhere.applicantLocationRequirements.length, 2);
console.log('jobs.ts: all checks passed');
