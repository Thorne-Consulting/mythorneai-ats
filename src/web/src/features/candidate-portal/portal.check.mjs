// Run: node --experimental-strip-types src/features/candidate-portal/portal.check.mjs
import assert from 'node:assert';
import { statusSteps, whatHappensNext } from './portal.ts';

// Same words the single-page portal used.
assert.equal(
  whatHappensNext({ status: 'Active', stage: 'New' }),
  "We're reviewing your application",
);
assert.equal(
  whatHappensNext({ status: 'Active', stage: 'Phone screen' }),
  "We're reviewing your application",
);
assert.equal(whatHappensNext({ status: 'Active', stage: 'Booked' }), 'Interviews are in progress');
assert.equal(whatHappensNext({ status: 'Active', stage: 'Offer' }), "We're making a decision");
assert.equal(whatHappensNext({ status: 'Active', stage: 'Take-home' }), 'Current step: Take-home');
assert.equal(whatHappensNext({ status: 'Hired', stage: 'Offer' }), 'You got the job');
assert.equal(
  whatHappensNext({ status: 'Withdrawn', stage: 'New' }),
  'You withdrew this application',
);

const states = (app) =>
  statusSteps(app)
    .map((s) => `${s.id}:${s.state}`)
    .join(' ');
assert.equal(
  states({ status: 'Active', stage: 'New' }),
  'applied:done review:current interview:todo decision:todo',
);
assert.equal(
  states({ status: 'Active', stage: 'Onsite interview' }),
  'applied:done review:done interview:current decision:todo',
);
assert.equal(
  states({ status: 'Rejected', stage: 'Onsite interview' }),
  'applied:done review:done interview:done outcome:final',
);
assert.equal(
  states({ status: 'Hired', stage: 'Hired' }),
  'applied:done review:done interview:done decision:done outcome:final',
);
assert.equal(
  statusSteps({ status: 'Active', stage: 'Take-home' })[1].title,
  'Current step: Take-home',
);
assert.equal(statusSteps({ status: 'Hired', stage: 'x' }).at(-1).positive, true);
console.log('portal ok');

// Derived views: to-do order, upcoming interviews, activity feed.
{
  const { todoItems, upcomingInterviews, activityFeed, isClosed } = await import('./portal.ts');
  const now = new Date('2026-11-13T12:00:00Z');
  const app = (over) => ({
    id: 'a',
    requisitionId: 'r',
    jobTitle: 'Analyst',
    stage: 'Interview',
    status: 'Active',
    appliedAt: '2026-11-01T00:00:00Z',
    lastActivityAt: '2026-11-10T00:00:00Z',
    canWithdraw: true,
    canReschedule: true,
    thread: [],
    interviews: [],
    proposedInterviews: [],
    messages: [],
    ...over,
  });
  const portal = {
    applications: [
      app({
        id: 'a1',
        thread: [
          {
            id: 'm1',
            fromCandidate: false,
            body: 'hi',
            createdAt: '2026-11-12T00:00:00Z',
            unread: true,
          },
        ],
        interviews: [
          {
            id: 'i1',
            title: 'Technical interview',
            startsAt: '2026-11-14T10:00:00Z',
            endsAt: '2026-11-14T11:00:00Z',
          },
        ],
      }),
      app({
        id: 'a2',
        proposedInterviews: [
          {
            id: 'p1',
            title: 'Phone screen',
            startsAt: '2026-11-15T10:00:00Z',
            endsAt: '2026-11-15T10:30:00Z',
          },
          {
            id: 'p2',
            title: 'Phone screen',
            startsAt: '2026-11-16T10:00:00Z',
            endsAt: '2026-11-16T10:30:00Z',
          },
        ],
      }),
      app({ id: 'a3', stage: 'Offer handoff' }),
      app({ id: 'a4', status: 'Rejected' }),
    ],
  };
  const todo = todoItems(portal);
  assert.deepEqual(
    todo.map((t) => t.kind),
    ['book', 'message', 'offer'], // an upcoming interview is the Next interview card, not a to-do
  );
  assert.equal(todo[0].href, '/candidate-portal/applications/a2/interviews');
  assert.equal(todo.filter((t) => t.kind === 'book').length, 1); // two slots, one interview
  assert.equal(todo[0].detail, 'Analyst · 2 times to choose from');
  assert.equal(todo[1].title, '1 new message from the hiring team');
  assert.deepEqual(
    upcomingInterviews(portal, now).map((i) => i.id),
    ['i1'],
  );
  assert.equal(upcomingInterviews(portal, new Date('2026-11-20T00:00:00Z')).length, 0);
  const feed = activityFeed(portal, 3);
  assert.equal(feed.length, 3);
  assert.equal(feed[0].id, 'm-m1'); // newest first
  assert.equal(isClosed({ status: 'Hired' }), true);
  assert.equal(isClosed({ status: 'Active' }), false);
  console.log('portal views ok');
}
