// Run: node --experimental-strip-types src/lib/ability/rules.check.mjs
// Rules shaped exactly as /api/auth/me sends them (Abilities.RulesFor on the server).
import assert from 'node:assert';
import {
  abilityFor,
  asJob,
  canManageWorkspace,
  changesEveryOpenJob,
  describeAbility,
} from './rules.ts';

const me = 'dana@example.test';
const managing = { $elemMatch: { email: me, role: { $in: ['HiringManager', 'Recruiter'] } } };
const recruiter = abilityFor([
  { action: 'read', subject: 'Candidate' },
  { action: 'read', subject: 'Job', conditions: { members: { $elemMatch: { email: me } } } },
  { action: 'read', subject: 'Job', conditions: { viewerEmails: me } },
  {
    action: 'read',
    subject: 'Job',
    conditions: { isConfidential: false, department: { $in: ['Engineering'] } },
  },
  { action: 'update', subject: 'Job', conditions: { members: managing } },
  { action: 'update', subject: 'Job', conditions: { ownerEmail: me } },
  {
    action: 'update',
    subject: 'Job',
    conditions: { isConfidential: false, department: { $in: ['Engineering'] } },
  },
  { action: 'create', subject: 'Job' },
  { action: 'create', subject: 'Candidate' },
]);

// "Jobs you see" on Profile: open jobs for a recruiter, only their own for a hiring manager
// whose teams widen what they read but not what they change.
assert.ok(changesEveryOpenJob(recruiter));
assert.ok(
  !changesEveryOpenJob(
    abilityFor([
      { action: 'read', subject: 'Job', conditions: { isConfidential: false } },
      { action: 'update', subject: 'Job', conditions: { ownerEmail: me } },
    ]),
  ),
);

// Teams: open jobs in Engineering, not in Sales.
assert.ok(recruiter.can('update', asJob({ isConfidential: false, department: 'Engineering' })));
assert.ok(!recruiter.can('update', asJob({ isConfidential: false, department: 'Sales' })));
// A second recruiter on a confidential job manages it through members; a viewer only reads it.
const job = (role) => ({
  isConfidential: true,
  department: 'Sales',
  members: [{ email: me, role }],
});
assert.ok(recruiter.can('update', asJob(job('Recruiter'))));
assert.ok(!recruiter.can('update', asJob(job('Viewer'))));
assert.ok(recruiter.can('read', asJob(job('Viewer'))));
// List rows without members fall back to the email mirrors.
assert.ok(
  recruiter.can('update', asJob({ isConfidential: true, department: 'Sales', ownerEmail: me })),
);
assert.ok(
  recruiter.can('read', asJob({ isConfidential: true, department: 'Sales', viewerEmails: [me] })),
);
// asJob copies, so cached records are never tagged.
const cached = { isConfidential: false, department: 'Engineering' };
asJob(cached);
assert.equal(Object.getOwnPropertyNames(cached).length, 2);

// Job list rows (GET /api/requisitions) carry members and isConfidential, so rows check like the job.
const row = {
  isConfidential: true,
  department: 'Sales',
  ownerEmail: 'x@example.test',
  members: [{ email: me, role: 'Viewer' }],
};
assert.ok(!recruiter.can('update', asJob(row)));
assert.ok(
  recruiter.can('update', asJob({ ...row, members: [{ email: me, role: 'HiringManager' }] })),
);

// Candidate record, notes and the hiring team, as Abilities.RulesFor sends them per role.
const hiringManager = abilityFor([
  { action: 'read', subject: 'Candidate' },
  { action: 'update', subject: 'Job', conditions: { members: managing } },
  { action: 'create', subject: 'Application' },
  { action: 'schedule', subject: 'Interview' },
  { action: 'read', subject: 'Message' },
  { action: 'update', subject: 'Note' },
]);
const interviewer = abilityFor([
  { action: 'read', subject: 'Candidate' },
  { action: 'read', subject: 'Interview', conditions: { interviewerEmails: me } },
  { action: 'submit', subject: 'Scorecard' },
]);
const admin = abilityFor([{ action: 'manage', subject: 'all' }]);
// Hiring managers add people to jobs and pin notes, but don't edit, tag or delete candidates.
assert.ok(hiringManager.can('create', 'Application') && hiringManager.can('update', 'Note'));
assert.ok(!hiringManager.can('update', 'Candidate') && !hiringManager.can('delete', 'Note'));
// "Works on jobs" (the team dashboard, the Jobs nav): any conditional job rule counts.
assert.ok(hiringManager.can('update', 'Job') && !interviewer.can('read', 'Job'));
assert.ok(!interviewer.can('update', 'Note') && !interviewer.can('schedule', 'Interview'));
// Deleting candidates and other people's notes is for admins.
assert.ok(admin.can('delete', 'Candidate') && admin.can('delete', 'Note'));
assert.ok(!recruiter.can('delete', 'Candidate'));

assert.ok(!canManageWorkspace(recruiter));
assert.ok(canManageWorkspace(abilityFor([{ action: 'manage', subject: 'all' }])));
assert.ok(describeAbility(recruiter).includes('Add and edit candidates.'));
assert.ok(!describeAbility(recruiter).some((line) => line.includes('reports')));
assert.equal(abilityFor([]).can('read', 'Job'), false);

console.log('ability rules ok');
