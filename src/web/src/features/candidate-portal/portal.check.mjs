// Run: node --experimental-strip-types src/features/candidate-portal/portal.check.mjs
import assert from 'node:assert';
import { statusSteps, whatHappensNext } from './portal.ts';

// The stage type decides the phase, whatever the label says.
assert.equal(
  whatHappensNext({ status: 'Active', stage: 'Chat with Sam', stageType: 'Interview' }),
  'Interviews are in progress',
);
assert.equal(
  whatHappensNext({ status: 'Active', stage: 'Take-home', stageType: 'Screen' }),
  "We're reviewing your application",
);

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

// Derived views: to-do order, upcoming interviews, the inbox list, application order.
{
  const {
    todoItems,
    upcomingInterviews,
    interviewSoon,
    threadItems,
    sortApplications,
    isClosed,
    when,
  } = await import('./portal.ts');
  const now = new Date('2026-11-13T12:00:00Z');
  const app = (over) => ({
    id: 'a',
    requisitionId: 'r',
    jobTitle: 'Analyst',
    jobListed: true,
    stage: 'Interview',
    status: 'Active',
    appliedAt: '2026-11-01T00:00:00Z',
    lastActivityAt: '2026-11-10T00:00:00Z',
    emailConfirmed: true,
    canWithdraw: true,
    canReschedule: true,
    offerSentAt: null,
    documentRequests: [],
    thread: [],
    interviews: [],
    proposedInterviews: [],
    emails: [],
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
        emails: [
          {
            id: 'e1',
            subject: 'We received your application',
            body: null,
            createdAt: '2026-11-11T00:00:00Z',
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
      // A stage called "Offer" is not an offer; only a sent one is.
      app({ id: 'a3', stage: 'Offer handoff' }),
      app({ id: 'a5', offerSentAt: '2026-11-12T00:00:00Z' }),
      app({ id: 'a6', emailConfirmed: false }),
      app({
        id: 'a7',
        documentRequests: [
          { id: 'd1', label: 'Portfolio', kind: 'Portfolio', requestedAt: '2026-11-12T00:00:00Z' },
        ],
      }),
      app({
        id: 'a4',
        status: 'Rejected',
        emailConfirmed: false,
        // A closed application asks for nothing.
        documentRequests: [
          { id: 'd2', label: 'Reference', kind: 'Other', requestedAt: '2026-11-12T00:00:00Z' },
        ],
        lastActivityAt: '2026-11-12T00:00:00Z',
      }),
    ],
  };
  const todo = todoItems(portal);
  assert.deepEqual(
    todo.map((t) => `${t.kind}:${t.applicationId}`),
    ['confirm:a6', 'offer:a5', 'book:a2', 'document:a7', 'message:a1'],
  );
  assert.equal(todo[3].title, 'Add your portfolio');
  assert.equal(todo[3].href, '/candidate-portal/applications/a7#documents');
  assert.equal(todo[2].href, '/candidate-portal/applications/a2#interviews');
  assert.equal(todo[2].detail, 'Analyst · 2 times to choose from');
  assert.equal(todo[4].href, '/candidate-portal/messages/a1');
  assert.equal(todo[4].title, '1 new message from the hiring team');
  assert.deepEqual(
    upcomingInterviews(portal, now).map((i) => i.id),
    ['i1'],
  );
  assert.equal(interviewSoon(portal, now)?.id, 'i1');
  assert.equal(interviewSoon(portal, new Date('2026-11-01T00:00:00Z')), null); // more than a week out
  assert.deepEqual(
    threadItems(portal.applications[0]).map((t) => t.kind),
    ['email', 'message'],
  );
  assert.equal(sortApplications(portal.applications).at(-1).id, 'a4'); // closed last
  assert.equal(isClosed({ status: 'Hired' }), true);
  assert.equal(isClosed({ status: 'Active' }), false);
  assert.match(when('2026-11-14T15:00:00Z', 'America/New_York'), /10:00\sAM EST/);
  console.log('portal views ok');
}

// Where to go after signing in: portal pages only.
{
  const { safeNext, fileSize } = await import('./portal.ts');
  assert.equal(
    safeNext('/candidate-portal/applications/a1#interviews'),
    '/candidate-portal/applications/a1#interviews',
  );
  assert.equal(safeNext('https://evil.example/candidate-portal/'), null);
  assert.equal(safeNext('//evil.example'), null);
  assert.equal(safeNext('/candidate-portal//evil.example'), null);
  assert.equal(safeNext('/careers'), null);
  assert.equal(safeNext(null), null);
  assert.equal(fileSize(500), '1 KB');
  assert.equal(fileSize(2.5 * 1024 * 1024), '2.5 MB');
  console.log('portal sign-in ok');
}
