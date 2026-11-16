// Makes the help page pictures: the top 900 px of a dark-mode screenshot for each how-to.
// Run after `npm run shots` in src/web:  node tools/help-images.mjs
// Reads docs/screenshots, writes src/web/public/help/<guide key>.png with the Mac `sips` tool.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const from = path.join(root, 'docs/screenshots');
const to = path.join(root, 'src/web/public/help');
mkdirSync(to, { recursive: true });
const files = readdirSync(from);

// Guide key -> the screenshot, as a pattern (record ids differ from one database to the next).
const PICTURES = {
  search: /^staff-desktop-dark_\.png$/,
  dashboard: /^staff-desktop-dark_\.png$/,
  notifications: /^staff-desktop-dark_notifications\.png$/,
  preferences: /^staff-desktop-dark_settings_preferences\.png$/,
  'post-job': /^staff-desktop-dark_jobs_new\.png$/,
  job: /^staff-desktop-dark_jobs_[0-9a-f-]{36}\.png$/,
  approve: /^staff-desktop-dark_approvals\.png$/,
  team: /^staff-desktop-dark_jobs_[0-9a-f-]{36}_team\.png$/,
  stages: /^staff-desktop-dark_settings_pipelines\.png$/,
  'add-candidate': /^staff-desktop-dark_candidates\.png$/,
  candidate: /^staff-desktop-dark_candidates_[0-9a-f-]{36}\.png$/,
  move: /^staff-desktop-dark_jobs_[0-9a-f-]{36}_pipeline\.png$/,
  'talent-pools': /^staff-desktop-dark_candidates_talent-pools\.png$/,
  'saved-views': /^staff-desktop-dark_candidates_views_[0-9a-f-]{36}\.png$/,
  compare: /^staff-desktop-dark_candidates_compare.*\.png$/,
  schedule: /^staff-desktop-dark_interviews_schedule\.png$/,
  feedback: /^staff-desktop-dark_interviews_[0-9a-f-]{36}_feedback\.png$/,
  kits: /^staff-desktop-dark_jobs_[0-9a-f-]{36}_kits\.png$/,
  room: /^staff-desktop-dark_interviews_[0-9a-f-]{36}_room\.png$/,
  calendar: /^staff-desktop-dark_settings_availability\.png$/,
  offer: /^staff-desktop-dark_applications_[0-9a-f-]{36}_offer\.png$/,
  'offer-letters': /^staff-desktop-dark_settings_offer-letters\.png$/,
  inbox: /^staff-desktop-dark_messages\.png$/,
  templates: /^staff-desktop-dark_messages_templates\.png$/,
  'bulk-email': /^staff-desktop-dark_candidates\.png$/,
  assessment: /^staff-desktop-dark_assessments_[0-9a-f-]{36}_edit\.png$/,
  'send-assessment': /^staff-desktop-dark_assessments_[0-9a-f-]{36}\.png$/,
  report: /^staff-desktop-dark_reports\.png$/,
  'report-view': /^staff-desktop-dark_reports_funnel\.png$/,
  careers: /^staff-desktop-dark_settings_careers\.png$/,
  'careers-site': /^public-desktop-dark_careers\.png$/,
  portal: /^portal-interview-desktop-dark_candidate-portal_home\.png$/,
  members: /^staff-desktop-dark_settings_members\.png$/,
  role: /^staff-desktop-dark_settings_roles\.png$/,
  workflows: /^staff-desktop-dark_settings_workflows_[0-9a-f-]{36}\.png$/,
  'rejection-reasons': /^staff-desktop-dark_settings_rejection-reasons\.png$/,
  activity: /^staff-desktop-dark_settings_activity\.png$/,
};

const missing = [];
for (const [key, pattern] of Object.entries(PICTURES)) {
  const file = files.find((f) => pattern.test(f));
  if (!file) {
    missing.push(key);
    continue;
  }
  const out = path.join(to, `${key}.png`);
  // Screenshots are 2 device pixels per CSS pixel: 2880 wide. Keep the top 1800 rows, then halve.
  // sips crops from the centre unless an offset is set, and treats "0 0" as unset; "0 1" with a
  // crop one pixel narrower anchors it to the top.
  execFileSync(
    'sips',
    ['--cropOffset', '0', '1', '-c', '1800', '2878', path.join(from, file), '--out', out],
    { stdio: 'ignore' },
  );
  execFileSync('sips', ['-Z', '1440', out], { stdio: 'ignore' });
}
console.log(`${Object.keys(PICTURES).length - missing.length} pictures written to ${to}`);
if (missing.length) console.log(`no screenshot for: ${missing.join(', ')}`);
