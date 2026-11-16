// Run: node src/features/applicants/reject-many.check.mjs
// The bulk reject sends the note its reason asks for (the API refuses a close without it).
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const src = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { '@': src }, jsx: { runtime: 'automatic' } });
const { rejectManyChoice } = await jiti.import('./RejectManyModal.tsx');

const form = {
  reason: 'Other',
  note: '',
  needsNote: true,
  status: 'Rejected',
  sendEmail: true,
  sendAt: '2026-12-01T09:00:00Z',
  cancelInterviews: true,
  withdrawOffer: false,
};

// No reason, or a reason that asks for a note without one: Reject stays off.
assert.equal(rejectManyChoice({ ...form, reason: null }), null);
assert.equal(rejectManyChoice(form), null);
assert.equal(rejectManyChoice({ ...form, note: '   ' }), null);

// With the note: it goes trimmed, with everything else.
assert.deepEqual(rejectManyChoice({ ...form, note: '  Moved to another team  ' }), {
  reason: 'Other',
  dispositionNote: 'Moved to another team',
  status: 'Rejected',
  sendEmail: true,
  sendAt: '2026-12-01T09:00:00Z',
  cancelInterviews: true,
  withdrawOffer: false,
});

// A reason without the rule sends no note, even one typed before the reason changed.
assert.equal(
  rejectManyChoice({ ...form, reason: 'Skills', needsNote: false, note: 'old' }).dispositionNote,
  null,
);

// "They decided" never emails.
const withdrew = rejectManyChoice({ ...form, status: 'Withdrawn', needsNote: false });
assert.equal(withdrew.sendEmail, false);
assert.equal(withdrew.sendAt, null);

console.log('reject many ok');
