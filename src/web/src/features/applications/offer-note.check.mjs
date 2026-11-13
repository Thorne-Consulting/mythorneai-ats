// Run: node --experimental-strip-types src/features/applications/offer-note.check.mjs
import assert from 'node:assert';
import { composeOfferNote, emptyOfferTerms } from './offer-note.ts';

const full = {
  ...emptyOfferTerms(),
  baseSalary: 120000,
  bonus: ' 10% target ',
  startDate: '2026-12-01',
  workMode: 'Hybrid',
  location: 'London',
  notes: 'Strong panel.',
};
assert.equal(
  composeOfferNote(full),
  'Base salary: USD 120,000 per year\nBonus: 10% target\nStart date: December 1, 2026\nRole: Full-time · Hybrid · London\n\nStrong panel.',
);
// Nothing filled but the defaults: just the role line, no stray blank lines.
assert.equal(composeOfferNote(emptyOfferTerms()), 'Role: Full-time · On-site');
assert.equal(
  composeOfferNote({ ...emptyOfferTerms(), employmentType: '', workMode: '', notes: 'Only text' }),
  'Only text',
);
console.log('offer note ok');
