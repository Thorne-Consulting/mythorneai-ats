// Run: node --experimental-strip-types src/features/reports/custom-chart.check.mjs
import assert from 'node:assert/strict';
import { buildChart, defaultSpec, labelColumns, numericColumns } from './custom-chart.ts';

const columns = ['Source', 'Applications', 'Hired (%)', 'Note'];
const rows = [
  ['LinkedIn', 40, 10, 'x'],
  ['Referral', 12, 25, null],
  ['Walk-in', 3, null, 'y'],
  ['Agency', null, 5, null],
];

assert.deepEqual(numericColumns(columns, rows), ['Applications', 'Hired (%)']);
assert.deepEqual(labelColumns(columns, rows), ['Source', 'Note']);
assert.deepEqual(defaultSpec(columns, rows), {
  kind: 'bar',
  label: 'Source',
  values: ['Applications'],
  top: 0,
});
assert.equal(defaultSpec(['Name'], [['a']]), null);

// Top N sorts by the first value and drops rows with none.
const top = buildChart(columns, rows, {
  kind: 'pie',
  label: 'Source',
  values: ['Applications', 'Hired (%)'],
  top: 2,
});
assert.equal(top.kind, 'pie');
assert.deepEqual(top.columns, ['Source', 'Applications']);
assert.deepEqual(top.rows, [
  ['LinkedIn', 40],
  ['Referral', 12],
]);
assert.equal(top.title, 'Applications by Source');

// Many series keep every chosen column.
const bars = buildChart(columns, rows, {
  kind: 'bar',
  label: 'Source',
  values: ['Applications', 'Hired (%)'],
  top: 0,
});
assert.deepEqual(bars.columns, ['Source', 'Applications', 'Hired (%)']);
assert.equal(bars.rows.length, 3);
assert.equal(bars.title, 'By Source');

// Scatter takes x and y from the two values and keeps only rows with both.
const xy = buildChart(columns, rows, {
  kind: 'scatter',
  label: 'Source',
  values: ['Applications', 'Hired (%)'],
  top: 0,
});
assert.deepEqual(xy.columns, ['Applications', 'Hired (%)', 'Source']);
assert.deepEqual(xy.rows, [
  [40, 10, 'LinkedIn'],
  [12, 25, 'Referral'],
]);
console.log('custom chart ok');
