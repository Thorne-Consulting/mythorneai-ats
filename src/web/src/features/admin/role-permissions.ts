// What a role may do, in plain words. Kept free of React so the check file can run it.
// The server (`src/server/Auth/Permissions.cs`) owns the keys and enforces each one; this file only
// explains them and mirrors `Permissions.Normalize`, so the editor never shows a choice the API drops.

export type Permission =
  'workspace' | 'jobs' | 'all_jobs' | 'candidates' | 'import' | 'reports' | 'templates';

export const ALL_PERMISSIONS: Permission[] = [
  'workspace',
  'jobs',
  'all_jobs',
  'candidates',
  'import',
  'reports',
  'templates',
];

/** What each capability needs first. Without it the API refuses the work anyway. */
const NEEDS: Partial<Record<Permission, Permission>> = {
  all_jobs: 'jobs',
  candidates: 'jobs',
  import: 'candidates',
  templates: 'jobs',
};

export const PERMISSION_TEXT: Record<Permission, { label: string; text: string }> = {
  workspace: {
    label: 'Manage the workspace',
    text: 'Change settings, members and roles. See and change every job, including confidential ones. Includes everything below.',
  },
  jobs: {
    label: 'Jobs they are on',
    text: 'Post jobs. On jobs where they are a hiring manager or recruiter: edit the job, move and reject candidates, email them, schedule interviews and make offers.',
  },
  all_jobs: {
    label: 'Every open job',
    text: 'The same on every job that isn’t confidential. Teams, set for each person under Members, can narrow this.',
  },
  candidates: {
    label: 'Add and edit candidates',
    text: 'See everyone in the candidate database, add and edit people, tags, pools and files. Build interview kits and assessments.',
  },
  import: {
    label: 'Import candidates',
    text: 'Add many people at once from a spreadsheet (CSV or Excel).',
  },
  reports: {
    label: 'See reports',
    text: 'Hiring reports for the jobs they can see, exports and report emails.',
  },
  templates: {
    label: 'Edit shared templates',
    text: 'Change the email, job posting and offer letter templates the whole team uses.',
  },
};

/** Which jobs a role works on: a choice of one, shown as radio buttons. */
export type JobScope = 'interviews' | 'jobs' | 'all_jobs';

export const JOB_SCOPES: { value: JobScope; label: string; text: string }[] = [
  {
    value: 'interviews',
    label: 'Only interviews they are on',
    text: 'See the candidates they interview and give feedback. No jobs, messages or offers.',
  },
  { value: 'jobs', label: PERMISSION_TEXT.jobs.label, text: PERMISSION_TEXT.jobs.text },
  {
    value: 'all_jobs',
    label: PERMISSION_TEXT.all_jobs.label,
    text: 'Everything above, on every job that isn’t confidential. Teams, set for each person under Members, can narrow this.',
  },
];

export const jobScopeOf = (permissions: readonly string[]): JobScope =>
  permissions.includes('all_jobs')
    ? 'all_jobs'
    : permissions.includes('jobs')
      ? 'jobs'
      : 'interviews';

/** Known keys only, with what they need; managing the workspace includes everything. */
export function normalizePermissions(permissions: readonly string[]): Permission[] {
  const set = new Set(
    permissions.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission)),
  );
  if (set.has('workspace')) return [...ALL_PERMISSIONS];
  let dropped = true;
  while (dropped) {
    dropped = false;
    for (const p of set) {
      const need = NEEDS[p];
      if (need && !set.has(need)) {
        set.delete(p);
        dropped = true;
      }
    }
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Turns one capability on or off, keeping what it needs and dropping what needs it. */
export function togglePermission(
  permissions: readonly string[],
  permission: Permission,
  on: boolean,
): Permission[] {
  if (on) {
    const add: Permission[] = [permission];
    for (let need = NEEDS[permission]; need; need = NEEDS[need]) add.push(need);
    return normalizePermissions([...permissions, ...add]);
  }
  // Off: managing the workspace stops including everything, so keep what else was there.
  const rest = permissions.filter((p) => p !== permission);
  return normalizePermissions(
    permission === 'workspace' ? rest.filter((p) => p !== 'workspace') : rest,
  );
}

export function setJobScope(permissions: readonly string[], scope: JobScope): Permission[] {
  const rest = permissions.filter((p) => p !== 'jobs' && p !== 'all_jobs');
  return normalizePermissions(
    scope === 'all_jobs'
      ? [...rest, 'jobs', 'all_jobs']
      : scope === 'jobs'
        ? [...rest, 'jobs']
        : rest,
  );
}

/** One short line: "Every open job, candidates, imports, reports and templates." */
export function summarizePermissions(permissions: readonly string[]): string {
  const p = normalizePermissions(permissions);
  if (p.includes('workspace')) return 'Everything, including settings, members and roles.';
  const scope = jobScopeOf(p);
  const head =
    scope === 'all_jobs'
      ? 'Every open job'
      : scope === 'jobs'
        ? 'The jobs they are on'
        : 'Only the interviews they are on';
  const extras = [
    p.includes('candidates') && 'candidates',
    p.includes('import') && 'imports',
    p.includes('reports') && 'reports',
    p.includes('templates') && 'templates',
  ].filter((x): x is string => !!x);
  const parts = [head, ...extras];
  return parts.length === 1
    ? `${head}.`
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}
