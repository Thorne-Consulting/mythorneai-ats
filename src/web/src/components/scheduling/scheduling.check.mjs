// node --experimental-strip-types src/web/src/components/scheduling/scheduling.check.mjs
import assert from 'node:assert/strict';
import {
  byDay,
  calendarLinks,
  dayKey,
  minuteOfDay,
  monthGrid,
  shiftMonth,
  timeLabel,
  zonedInstant,
} from './time.ts';

// 01:30 UTC on Nov 20 is still Nov 19 in Chicago.
assert.equal(dayKey('2026-11-20T01:30:00Z', 'America/Chicago'), '2026-11-19');
assert.equal(dayKey('2026-11-20T01:30:00Z', 'Europe/London'), '2026-11-20');
assert.equal(timeLabel('2026-11-20T15:00:00Z', 'America/New_York'), '10:00 AM');

const days = byDay(
  [
    { startsAt: '2026-11-20T15:00:00Z', endsAt: '2026-11-20T15:30:00Z' },
    { startsAt: '2026-11-20T01:00:00Z', endsAt: '2026-11-20T01:30:00Z' },
  ],
  'America/Chicago',
);
assert.deepEqual([...days.keys()], ['2026-11-19', '2026-11-20']);

// November 2026 starts on a Sunday: six blanks before it in a Monday-first grid.
const grid = monthGrid('2026-11-05');
assert.equal(grid.indexOf('2026-11-01'), 6);
assert.equal(grid.length % 7, 0);
assert.equal(shiftMonth('2026-12-15', 1), '2027-01-01');

// 9:30 in Chicago on a winter day is 15:30 UTC; across the spring change it is 14:30 UTC.
assert.equal(
  zonedInstant('2026-11-19', '09:30', 'America/Chicago').toISOString(),
  '2026-11-19T15:30:00.000Z',
);
assert.equal(
  zonedInstant('2026-03-09', '09:30', 'America/Chicago').toISOString(),
  '2026-03-09T14:30:00.000Z',
);
assert.equal(minuteOfDay('2026-11-19T15:30:00Z', 'America/Chicago'), 570);

const links = calendarLinks({
  title: 'Interview',
  startsAt: '2026-11-19T15:30:00Z',
  endsAt: '2026-11-19T16:15:00Z',
});
assert.match(links.google, /dates=20261119T153000Z%2F20261119T161500Z/);
console.log('scheduling checks passed');
