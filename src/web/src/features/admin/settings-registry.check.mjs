// Run: node --experimental-strip-types src/features/admin/settings-registry.check.mjs
import assert from 'node:assert';
import {
  findSettingsPage,
  movedSettingsHref,
  searchSettings,
  settingsGroups,
} from './settings-registry.ts';

// Stand-ins for a person's ability: an admin manages the workspace, others do not.
const admin = { can: () => true };
const nobody = { can: () => false };

// Every old /admin address lands somewhere real.
assert.equal(movedSettingsHref('/admin'), '/settings/members');
assert.equal(movedSettingsHref('/admin/'), '/settings/members');
assert.equal(movedSettingsHref('/admin/portal'), '/settings/careers');
assert.equal(movedSettingsHref('/admin/email'), '/settings/email');
assert.equal(movedSettingsHref('/admin/email-templates'), '/settings/templates/email');
assert.equal(movedSettingsHref('/admin/invitations'), '/settings/members?tab=invited');
assert.equal(movedSettingsHref('/admin/access-requests'), '/settings/members?tab=requests');
assert.equal(movedSettingsHref('/admin/team-access'), '/settings/members');
assert.equal(movedSettingsHref('/admin/roles/hiring-manager'), '/settings/roles/hiring-manager');
assert.equal(movedSettingsHref('/admin/templates/new'), '/settings/templates/new');
assert.equal(movedSettingsHref('/admin/ai'), '/settings/ai/activity');
assert.equal(movedSettingsHref('/admin/ai-settings'), '/settings/ai');
assert.equal(movedSettingsHref('/admin/workflows/abc'), '/settings/workflows/abc');
assert.equal(movedSettingsHref('/admin/audit'), '/settings/activity');
assert.equal(movedSettingsHref('/admin/nothing-here'), '/settings/members');

// The rail lights the owning page, including child pages.
assert.equal(findSettingsPage('/settings/roles/recruiter').page.href, '/settings/roles');
assert.equal(findSettingsPage('/settings/templates/email').page.href, '/settings/templates');
assert.equal(findSettingsPage('/settings/ai/activity').page.href, '/settings/ai');
assert.equal(findSettingsPage('/settings/nope'), undefined);

// Non-admins only see their own pages.
assert.deepEqual(
  settingsGroups(nobody).map((g) => g.label),
  ['Your account'],
);
assert.ok(settingsGroups(admin).length > 5);

// Search matches labels and keywords, every word.
const hits = (q) =>
  searchSettings(settingsGroups(admin), q).flatMap((g) => g.pages.map((p) => p.href));
assert.deepEqual(hits('webhooks'), ['/settings/webhooks']);
assert.ok(hits('invite').includes('/settings/members'));
assert.ok(hits('dark mode').includes('/settings/preferences'));
assert.deepEqual(hits('zzz'), []);
assert.equal(hits('').length, settingsGroups(admin).flatMap((g) => g.pages).length);
console.log('settings registry ok');
