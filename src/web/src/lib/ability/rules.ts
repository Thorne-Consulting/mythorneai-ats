import { createMongoAbility, subject, type MongoAbility, type RawRuleOf } from '@casl/ability';

/**
 * What a person may do, from the rules the server computes for them (`rules` on /api/auth/me).
 * The API enforces the same rules; the interface uses these only to hide what someone can't do.
 * Plain module (no hooks) so server components can check too.
 */
export type Action =
  'manage' | 'read' | 'create' | 'update' | 'delete' | 'import' | 'schedule' | 'send' | 'submit';

export type SubjectName =
  | 'all'
  | 'Job'
  | 'Candidate'
  | 'Application'
  | 'Interview'
  | 'Scorecard'
  | 'Message'
  | 'Note'
  | 'Report'
  | 'Offer'
  | 'Template'
  | 'Assessment'
  | 'InterviewKit'
  | 'Member'
  | 'Workspace';

// A record checked against a rule's conditions, for example `asJob(job)`.
type Tagged = Record<string, unknown> & { __caslSubjectType__: SubjectName };

export type AppAbility = MongoAbility<[Action, SubjectName | Tagged]>;
export type AbilityRule = RawRuleOf<AppAbility>;

export const abilityFor = (rules: AbilityRule[] = []): AppAbility =>
  createMongoAbility<AppAbility>(rules);

/**
 * Marks a record as a kind of thing, so a rule's conditions are checked against its fields:
 * `can('update', asRecord('Job', job))`. Copies the record, so cached query data stays untouched.
 */
export const asRecord = (type: SubjectName, record: object) =>
  subject(type, { ...record }) as unknown as Tagged;

/**
 * A job checked against job rules. Give it `members` (`[{ email, role }]`, as on the job page), or
 * on list rows the `ownerEmail`/`recruiterEmail`/`viewerEmails` mirrors; plus `isConfidential` and
 * `department`.
 */
export const asJob = (job: object) => asRecord('Job', job);

/** Workspace settings: everything under Settings except "Your account". */
export const canManageWorkspace = (ability: AppAbility) => ability.can('manage', 'Workspace');

/** Whether job rules reach every job that isn't confidential, rather than only the jobs they are on. */
export const changesEveryOpenJob = (ability: AppAbility) =>
  ability
    .rulesFor('update', 'Job')
    .some((rule) => rule.conditions && 'isConfidential' in rule.conditions);

/** Plain sentences for "What you can do here", most useful first. */
export function describeAbility(ability: AppAbility): string[] {
  if (ability.can('manage', 'all'))
    return [
      'Everything in this workspace, including settings, members and roles.',
      'See every job, candidate, offer and report.',
    ];
  const lines: string[] = [];
  const jobs = ability.rulesFor('update', 'Job');
  if (ability.can('create', 'Job')) lines.push('Post new jobs.');
  if (jobs.length > 0)
    lines.push(
      changesEveryOpenJob(ability)
        ? 'Manage the jobs you can see, and move candidates through them.'
        : 'Manage the jobs where you are a hiring manager or recruiter, and move candidates through them.',
    );
  if (ability.can('create', 'Candidate')) lines.push('Add and edit candidates.');
  if (ability.can('import', 'Candidate')) lines.push('Import candidates from a spreadsheet (CSV).');
  if (ability.can('schedule', 'Interview')) lines.push('Schedule interviews.');
  if (ability.can('send', 'Message')) lines.push('Message candidates.');
  lines.push('See your interviews and submit feedback on them.');
  if (ability.can('read', 'Report')) lines.push('See hiring reports.');
  if (ability.can('manage', 'Template')) lines.push('Edit the wording of emails to candidates.');
  return lines;
}
