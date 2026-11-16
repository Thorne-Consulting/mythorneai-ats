// node --experimental-strip-types src/features/dashboard/activity-text.check.mjs
import assert from 'node:assert/strict';
import { activityText } from './activity-text.ts';

const base = {
  candidateName: 'Casey Lee',
  actorName: 'Priya Raman',
  mine: false,
  detail: 'Review',
};
assert.equal(activityText({ ...base, verb: 'moved' }), 'Priya Raman moved Casey Lee to Review');
assert.equal(activityText({ ...base, verb: 'moved', mine: true }), 'You moved Casey Lee to Review');
assert.equal(
  activityText({ ...base, verb: 'moved', actorName: null }),
  'Casey Lee moved to Review',
);
assert.equal(
  activityText({ ...base, verb: 'rejected', actorName: null }),
  'Casey Lee was rejected',
);
assert.equal(
  activityText({ ...base, verb: 'scored', detail: 'Phone screen' }),
  'Priya Raman sent feedback on Casey Lee (Phone screen)',
);
console.log('activity text ok');
