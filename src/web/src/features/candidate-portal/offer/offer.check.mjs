// Run: node --experimental-strip-types src/features/candidate-portal/offer/offer.check.mjs
import assert from 'node:assert';
import { deadlineText, nameMatches, timeLeft } from './offer.ts';

// Typing your name: any case, extra spaces, but every letter.
assert.ok(nameMatches('  jordan   LEE ', 'Jordan Lee'));
assert.ok(!nameMatches('Jordan', 'Jordan Lee'));
assert.ok(!nameMatches('', 'Jordan Lee'));
assert.ok(nameMatches('José Núñez', 'josé núñez'));

// The deadline reads as the last open minute, in the reader's zone with the zone named.
// Closes at midnight New York time on December 2 = 05:00 UTC.
assert.equal(
  deadlineText('2026-12-02T05:00:00Z', 'America/New_York'),
  'Tuesday, December 1 at 11:59 PM EST',
);
// The same moment for someone in Los Angeles.
assert.equal(
  deadlineText('2026-12-02T05:00:00Z', 'America/Los_Angeles'),
  'Tuesday, December 1 at 8:59 PM PST',
);

const now = new Date('2026-11-28T12:00:00Z');
assert.equal(timeLeft('2026-12-02T05:00:00Z', now), '3 days left');
assert.equal(timeLeft('2026-11-29T05:00:00Z', now), 'Less than a day left');
assert.equal(timeLeft('2026-12-20T05:00:00Z', now), null);
assert.equal(timeLeft('2026-11-01T05:00:00Z', now), null);

console.log('offer.check: ok');
