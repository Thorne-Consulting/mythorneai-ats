// Run: node --experimental-strip-types src/features/reports/report-data.check.mjs
import assert from 'node:assert';
import {
  NO_FILTERS,
  delta,
  filtersFrom,
  percentColumn,
  queryString,
  rangeOptionLabel,
  sameFilters,
  savedViewHref,
  viewParams,
  withDrill,
} from './report-data.ts';

const filters = { ...NO_FILTERS, range: '30d', department: 'Engineering', groupBy: 'source' };

// A drill keeps the report's filters, drops the breakdown, and adds its own keys.
assert.deepEqual(withDrill(filters, { reached: 'Review' }), {
  range: '30d',
  department: 'Engineering',
  reached: 'Review',
});
// A drill with dates replaces the whole date filter.
assert.deepEqual(
  withDrill(
    { ...filters, from: '2026-01-01' },
    { range: '', from: '2026-10-01', to: '2026-10-31' },
  ),
  {
    department: 'Engineering',
    from: '2026-10-01',
    to: '2026-10-31',
  },
);

assert.deepEqual(percentColumn('Hired (%)'), { header: 'Hired', percent: true });
assert.deepEqual(percentColumn('Hires'), { header: 'Hires', percent: false });

assert.deepEqual(delta(57, 50), { direction: 'up', text: '+14%', good: true });
assert.deepEqual(delta(10, 20, true), { direction: 'down', text: '−50%', good: true });
assert.deepEqual(delta(3, 0), { direction: 'up', text: '+3', good: true });
assert.equal(delta(3, null), null);
// Rates change in points, not as a share of the old rate.
assert.deepEqual(delta(60, 50, false, true), { direction: 'up', text: '+10 points', good: true });
assert.deepEqual(delta(49, 50, false, true), { direction: 'down', text: '−1 point', good: false });

assert.equal(rangeOptionLabel('hired', 'quarter'), 'Hired this quarter');
assert.equal(rangeOptionLabel('applied', '30d'), 'Applied in the last 30 days');
assert.equal(rangeOptionLabel('interview', ''), 'Interviewed at any time');
assert.equal(rangeOptionLabel('offer', '30d'), 'Offer sent in the last 30 days');

// Saved views round-trip through the URL.
const json = viewParams('hires', { ...NO_FILTERS, groupBy: 'department' });
assert.equal(json, '{"report":"hires","groupBy":"department"}');
assert.equal(savedViewHref(json, 'v1'), '/reports/hires?groupBy=department&view=v1');
const back = filtersFrom(new URLSearchParams('groupBy=department&view=v1'));
assert.ok(sameFilters(back, { ...NO_FILTERS, groupBy: 'department' }));
assert.equal(savedViewHref('not json'), '/reports');

assert.equal(queryString({ source: 'LinkedIn', from: '', to: undefined }), 'source=LinkedIn');
console.log('report data ok');
