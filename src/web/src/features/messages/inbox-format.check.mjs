// Run: node --experimental-strip-types src/features/messages/inbox-format.check.mjs
import assert from 'node:assert/strict';
import {
  formatSize,
  listTime,
  plainPreview,
  timePresets,
  uniqueThreads,
  whenText,
} from './inbox-format.ts';

assert.deepEqual(
  uniqueThreads([{ applicationId: 'a' }, { applicationId: 'b' }, { applicationId: 'a' }]).map(
    (r) => r.applicationId,
  ),
  ['a', 'b'],
);
assert.equal(formatSize(512), '512 B');
assert.equal(formatSize(2048), '2 KB');
assert.equal(formatSize(3.5 * 1024 * 1024), '3.5 MB');
const now = new Date(2026, 10, 13, 15, 0);
assert.match(listTime(new Date(2026, 10, 13, 9, 42).toISOString(), now), /9:42/);
assert.doesNotMatch(listTime(new Date(2026, 10, 10, 9, 0).toISOString(), now), /:/);
assert.match(listTime(new Date(2025, 2, 3).toISOString(), now), /2025/);
// Snooze and send-later choices: "Later today" only before 3 PM; Monday is never today.
const friday = new Date(2026, 10, 13, 10, 0); // a Friday morning
const presets = timePresets(friday);
assert.deepEqual(
  presets.map((p) => p.label),
  ['Later today', 'Tomorrow morning', 'Next Monday'],
);
assert.equal(presets[0].at.getHours(), 13);
assert.equal(presets[1].at.getDate(), 14);
assert.equal(presets[2].at.getDay(), 1);
assert.equal(presets[2].at.getDate(), 16);
assert.equal(presets[2].at.getHours(), 9);
const mondayEvening = new Date(2026, 10, 16, 18, 0);
assert.deepEqual(
  timePresets(mondayEvening).map((p) => p.label),
  ['Tomorrow morning', 'Next Monday'],
);
assert.equal(timePresets(mondayEvening)[1].at.getDate(), 23);
assert.match(whenText(new Date(2026, 10, 14, 9, 0), friday), /^Tomorrow, 9:00/);
assert.match(whenText(new Date(2026, 10, 13, 17, 0), friday), /^Today, /);
// Previews read as one plain line: no Markdown marks, links as their words.
assert.equal(
  plainPreview('**Hi** Karen,\n\nSee [the portal](https://x.test) for <u>details</u>.'),
  'Hi Karen, See the portal for details.',
);
console.log('inbox-format: ok');
