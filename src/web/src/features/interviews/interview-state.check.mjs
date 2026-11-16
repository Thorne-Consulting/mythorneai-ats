// Run: node --experimental-strip-types src/features/interviews/interview-state.check.mjs
import assert from 'node:assert';
import { fromNow, interviewState, rangeText, whenPhrase, zoneName } from './interview-state.ts';

const start = '2026-11-20T15:00:00Z';
const end = '2026-11-20T16:00:00Z';
const at = (iso) => new Date(iso);

assert.equal(interviewState('Scheduled', start, end, at('2026-11-20T14:00:00Z')).key, 'upcoming');
assert.equal(interviewState('Scheduled', start, end, at('2026-11-20T15:30:00Z')).key, 'live');
assert.equal(interviewState('Scheduled', start, end, at('2026-11-20T16:00:00Z')).key, 'ended');
assert.equal(interviewState('Completed', start, end, at('2026-11-20T14:00:00Z')).key, 'completed');
assert.equal(interviewState('NoShow', start, end).tone, 'red');
assert.equal(interviewState('Cancelled', start, end).look, 'struck');
assert.equal(interviewState('Proposed', start, end).label, 'Waiting for candidate');

assert.equal(fromNow('2026-11-20T15:25:00Z', at('2026-11-20T15:00:00Z')), 'in 25 minutes');
assert.equal(fromNow('2026-11-20T12:00:00Z', at('2026-11-20T15:00:00Z')), '3 hours ago');
assert.equal(fromNow('2026-11-21T15:00:00Z', at('2026-11-20T15:00:00Z')), 'tomorrow');

const ended = interviewState('Scheduled', start, end, at('2026-11-20T19:00:00Z'));
assert.equal(whenPhrase(ended, start, end, at('2026-11-20T19:00:00Z')), '3 hours ago');
const live = interviewState('Scheduled', start, end, at('2026-11-20T15:40:00Z'));
assert.equal(whenPhrase(live, start, end, at('2026-11-20T15:40:00Z')), 'ends in 20 minutes');

assert.equal(zoneName('America/Chicago', at('2026-11-20T15:00:00Z')), 'Central Standard Time');
assert.equal(zoneName('America/Chicago', at('2026-07-20T15:00:00Z')), 'Central Daylight Time');
assert.match(
  rangeText(start, end, 'America/Chicago'),
  /^Friday, November 20, 9:00\s?–\s?10:00\sAM$/,
);
console.log('interview-state: ok');
