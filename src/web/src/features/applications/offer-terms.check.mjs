// Run: node --experimental-strip-types src/features/applications/offer-terms.check.mjs
import assert from 'node:assert';
import { formatPay, longDate, offerStep, termRows } from './offer-terms.ts';

const empty = {
  currency: 'USD',
  payPeriod: 'Year',
  bonus: '',
  equity: '',
  employmentType: '',
  workMode: '',
  location: '',
};
assert.deepEqual(termRows(empty), []);
assert.equal(formatPay(120000, 'EUR', 'Year'), '€120,000.00 per year');
assert.equal(formatPay(50, 'CAD', 'Hour'), 'CA$50.00 per hour');
assert.equal(longDate('2027-03-01'), 'March 1, 2027');
assert.deepEqual(
  termRows({
    ...empty,
    baseSalary: 95000.5,
    bonus: ' 10% target ',
    startDate: '2027-03-01',
    employmentType: 'Full time',
    workMode: 'Hybrid',
    location: 'Chicago',
    expiresOn: '2027-02-01',
  }),
  [
    { label: 'Base salary', value: '$95,000.50 per year' },
    { label: 'Bonus', value: '10% target' },
    { label: 'Start date', value: 'March 1, 2027' },
    { label: 'Role', value: 'Full time, Hybrid, Chicago' },
    { label: 'Open until', value: 'February 1, 2027' },
  ],
);
assert.equal(offerStep('PendingApproval'), 1);
assert.equal(offerStep('Accepted'), 5); // past the last step: everything done
console.log('offer terms ok');
