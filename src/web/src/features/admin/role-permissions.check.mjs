// Run: node --experimental-strip-types src/features/admin/role-permissions.check.mjs
// Mirrors Permissions.Normalize on the server (tests/server/AbilitiesTests.cs checks that side).
import assert from 'node:assert';
import {
  ALL_PERMISSIONS,
  jobScopeOf,
  normalizePermissions,
  setJobScope,
  summarizePermissions,
  togglePermission,
} from './role-permissions.ts';

// A capability without what it needs is dropped; the workspace includes everything.
assert.deepEqual(normalizePermissions(['import', 'all_jobs', 'reports', 'nonsense']), ['reports']);
assert.deepEqual(normalizePermissions(['workspace']), ALL_PERMISSIONS);

// Turning one on brings what it needs; turning one off drops what needs it.
assert.deepEqual(togglePermission([], 'import', true), ['jobs', 'candidates', 'import']);
assert.deepEqual(togglePermission(['jobs', 'candidates', 'import'], 'candidates', false), ['jobs']);
// Off with the workspace: the rest of the role stays as it was before.
assert.deepEqual(togglePermission(ALL_PERMISSIONS, 'workspace', false), ALL_PERMISSIONS.slice(1));

// The jobs radio: interviews only drops everything that works on jobs.
const recruiter = ['jobs', 'all_jobs', 'candidates', 'import', 'reports', 'templates'];
assert.equal(jobScopeOf(recruiter), 'all_jobs');
assert.deepEqual(setJobScope(recruiter, 'jobs'), [
  'jobs',
  'candidates',
  'import',
  'reports',
  'templates',
]);
assert.deepEqual(setJobScope(recruiter, 'interviews'), ['reports']);
assert.deepEqual(setJobScope(['reports'], 'all_jobs'), ['jobs', 'all_jobs', 'reports']);

assert.equal(
  summarizePermissions(recruiter),
  'Every open job, candidates, imports, reports and templates.',
);
assert.equal(summarizePermissions(['jobs', 'reports']), 'The jobs they are on and reports.');
assert.equal(summarizePermissions([]), 'Only the interviews they are on.');
assert.equal(
  summarizePermissions(['workspace']),
  'Everything, including settings, members and roles.',
);
console.log('role-permissions: ok');
