// node --experimental-strip-types src/features/careers/apply.check.mjs
import assert from 'node:assert/strict';
import {
  attentionText,
  autofill,
  countryFromLocale,
  EMPTY_DETAILS,
  phoneNumber,
  validate,
} from './apply.ts';

assert.equal(countryFromLocale('en-US'), 'US');
assert.equal(countryFromLocale('en_GB'), 'GB');
assert.equal(countryFromLocale('fr'), undefined);

assert.equal(phoneNumber('312 555 0142', 'US'), '+1 312 555 0142');
assert.equal(phoneNumber('+44 20 7946 0958'), '+44 20 7946 0958');
assert.equal(phoneNumber('12345', 'US'), null);

const ok = { ...EMPTY_DETAILS, firstName: 'Pat', lastName: 'Lee', email: 'pat@example.com' };
assert.deepEqual(validate(ok, 'US'), {});
assert.deepEqual(Object.keys(validate(EMPTY_DETAILS)), ['firstName', 'lastName', 'email']);
assert.ok(validate({ ...ok, email: 'pat@' }).email);
assert.ok(validate({ ...ok, phone: '555' }, 'US').phone);
assert.equal(validate({ ...ok, phone: '(312) 555-0142' }, 'US').phone, undefined);
assert.ok(validate({ ...ok, linkedInUrl: 'linkedin.com/in/pat' }).linkedInUrl);
assert.equal(
  validate({ ...ok, linkedInUrl: 'https://www.linkedin.com/in/pat' }).linkedInUrl,
  undefined,
);

// The resume fills only what is empty.
const { next, filled } = autofill(
  { ...EMPTY_DETAILS, email: 'typed@example.com' },
  {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'resume@example.com',
    phone: '+1 312 555 0142',
    linkedInUrl: null,
  },
);
assert.equal(next.email, 'typed@example.com');
assert.equal(next.firstName, 'Jordan');
assert.deepEqual(filled, ['firstName', 'lastName', 'phone']);

assert.equal(attentionText(1), '1 field needs attention');
assert.equal(attentionText(3), '3 fields need attention');
console.log('apply.ts: all checks passed');
