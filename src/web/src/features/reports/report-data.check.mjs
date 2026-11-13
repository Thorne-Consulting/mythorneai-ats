// Run: node --experimental-strip-types src/features/reports/report-data.check.mjs
import assert from 'node:assert';
import { aggregate, columnKinds, queryString } from './report-data.ts';

const rows = [
  ['LinkedIn', 'Engineering', 10, '2026-01-04'],
  ['Referral', 'Engineering', 4, '2026-01-20'],
  ['LinkedIn', 'Sales', 6, '2026-02-02'],
  [null, 'Sales', null, null],
];

assert.deepEqual(columnKinds(rows, 4), { dimensions: [0, 1, 3], metrics: [2] });
assert.deepEqual(aggregate(rows, 0, null, 'count'), [
  { name: 'LinkedIn', value: 2 },
  { name: 'Referral', value: 1 },
  { name: 'Unknown', value: 1 },
]);
assert.deepEqual(aggregate(rows, 1, 2, 'sum'), [
  { name: 'Engineering', value: 14 },
  { name: 'Sales', value: 6 },
]);
assert.deepEqual(aggregate(rows, 1, 2, 'avg'), [
  { name: 'Engineering', value: 7 },
  { name: 'Sales', value: 6 },
]);
assert.deepEqual(aggregate(rows, 0, 2, 'max')[0], { name: 'LinkedIn', value: 10 });
// Dates group by month.
assert.deepEqual(
  aggregate(rows, 3, null, 'count').map((g) => g.name),
  ['2026-01', '2026-02', 'Unknown'],
);
assert.equal(queryString({ source: 'LinkedIn', from: '', to: undefined }), 'source=LinkedIn');
console.log('report data ok');
