// Run: node --experimental-strip-types src/features/admin/audit-text.check.mjs
import assert from 'node:assert';
import { auditVerb, formatValue, parseChanges, parseDetails, typeLabel } from './audit-text.ts';

assert.equal(typeLabel('Requisition'), 'Job');
assert.equal(typeLabel('SomethingNew'), 'Something new');
assert.equal(auditVerb('StageChanged').verb, 'moved');
assert.equal(auditVerb('SignedIn').record, false);
assert.equal(auditVerb('OfferAccepted').verb, 'offer accepted on');

assert.deepEqual(
  parseChanges(
    '{"Role":{"from":"Recruiter","to":"HiringManager"},"IsActive":{"from":true,"to":false}}',
  ),
  [
    { field: 'Role', from: 'Recruiter', to: 'Hiring manager' },
    { field: 'Is active', from: 'Yes', to: 'No' },
  ],
);
assert.deepEqual(parseChanges('{"AllowedEmailDomains":{"from":[],"to":["acme.com","acme.org"]}}'), [
  { field: 'Allowed email domains', from: 'None', to: 'acme.com, acme.org' },
]);
assert.deepEqual(parseChanges('not json'), []);
assert.deepEqual(parseChanges(null), []);

assert.equal(formatValue(null), 'Not set');
assert.equal(formatValue(3), '3');
assert.equal(formatValue('acme.com'), 'acme.com');

assert.deepEqual(parseDetails('{"Reason":"domain","Count":2}'), [
  ['Reason', 'domain'],
  ['Count', '2'],
]);
assert.equal(parseDetails('Review to Interview'), 'Review to Interview');
assert.equal(parseDetails(null), null);
console.log('audit text ok');
