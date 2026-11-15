import {
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  ClipboardCheck,
  ClipboardList,
  ClipboardX,
  FileClock,
  FilePenLine,
  Clock,
  FileCheck2,
  FileX2,
  GitBranch,
  Hourglass,
  LogOut,
  Mail,
  MessageSquareReply,
  MoveRight,
  Bell,
  Send,
  ShieldCheck,
  Split,
  Tag,
  TagsIcon,
  UserPlus,
  UserX,
  Webhook,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Option } from '@/components/ui';
import type { GraphNode, Lookups, Values } from './workflow-api';

// Everything the editor knows about each kind of step: menu entry, inspector fields, the one-line
// summary on the canvas, and its outputs. The server (Features/Workflows/WorkflowGraph.cs) runs the
// same kinds and reads the same value formats:
//   job: "any" | "job:{id}" | "dept:{name}"      stage: "any" | "type:{Type}" | "name:{name}"
//   recipient: "candidate" | "recruiter" | "hiringManager" | "interviewers" | "person:{email}"

export type Group = 'Triggers' | 'Logic' | 'Actions';
export type FieldDef = {
  key: string;
  label: string;
  type: 'select' | 'search' | 'text' | 'textarea' | 'number' | 'duration' | 'tags' | 'value';
  options?: (l: Lookups, v: Values) => Option[];
  placeholder?: string;
  description?: string | ((l: Lookups, v: Values) => string | undefined);
  /** Only shown when this returns true. */
  show?: (v: Values) => boolean;
  /** Placeholder chips under a text box. */
  variables?: boolean;
  /** Units a duration may use, when not all of them. */
  units?: string[];
};
export type Output = { id: string; label: string };
export type StepDef = {
  kind: string;
  group: Group;
  label: string;
  /** One plain sentence on what the step does, under its name in the menu and the inspector. */
  help: string;
  icon: LucideIcon;
  fields: FieldDef[];
  defaults: Values;
  summary: (v: Values, l: Lookups | undefined) => string;
  /** Labelled outputs. Without it, a step has one plain output. */
  outputs?: (v: Values) => Output[];
};

export const GROUPS: Group[] = ['Triggers', 'Logic', 'Actions'];
export const GROUP_LABELS: Record<Group, string> = {
  Triggers: 'Start when',
  Logic: 'Check or wait',
  Actions: 'Then do',
};
/** The small word above a step's name. */
export const eyebrowOf = (def: Pick<StepDef, 'kind' | 'group'>) =>
  def.kind === 'logic.wait' ? 'Pause' : EYEBROW[def.group];
export const EYEBROW: Record<Group, string> = {
  Triggers: 'Starts when',
  Logic: 'Check',
  Actions: 'Action',
};

// ----- Options built from real data

const TYPE_WORDS: Record<string, string> = {
  Applied: 'applied',
  Screen: 'screening',
  Interview: 'interview',
  Offer: 'offer',
  Hired: 'hired',
  Other: 'other',
};

export function jobOptions(l: Lookups): Option[] {
  return [
    { value: 'any', label: 'Any job' },
    ...l.departments.map((d) => ({ value: `dept:${d}`, label: `${d} jobs`, group: 'Teams' })),
    ...l.jobs.map((j) => ({
      value: `job:${j.id}`,
      label: j.title,
      keywords: `${j.title} ${j.code}`,
      group: 'Jobs',
    })),
  ];
}

export function stageOptions(l: Lookups, opts: { any?: boolean; hired?: boolean } = {}): Option[] {
  return [
    ...(opts.any ? [{ value: 'any', label: 'Any stage' }] : []),
    ...l.stageTypes
      .filter((t) => opts.hired || t !== 'Hired')
      .map((t) => ({
        value: `type:${t}`,
        label: t === 'Hired' ? 'Hired' : `Any ${TYPE_WORDS[t] ?? t.toLowerCase()} stage`,
        group: 'By kind of stage',
      })),
    ...l.stages
      .filter((s) => opts.hired || s.type !== 'Hired')
      .map((s) => ({
        value: `name:${s.name}`,
        label: s.name,
        group: 'By name (in every job that has it)',
      })),
  ];
}

const anyOr = (anyLabel: string, values: string[]): Option[] => [
  { value: 'any', label: anyLabel },
  ...values.map((v) => ({ value: v, label: v })),
];

export const assessmentOptions = (l: Lookups): Option[] => [
  { value: 'any', label: 'Any assessment' },
  ...(l.assessments ?? []).map((a) => ({ value: a.id, label: a.name })),
];

export function recipientOptions(l: Lookups, interviewers: boolean): Option[] {
  return [
    { value: 'candidate', label: 'The candidate', group: 'From the application' },
    { value: 'recruiter', label: 'The job’s recruiter', group: 'From the application' },
    { value: 'hiringManager', label: 'The job’s hiring manager', group: 'From the application' },
    ...(interviewers
      ? [
          {
            value: 'interviewers',
            label: 'Interviewers who owe feedback',
            group: 'From the application',
          },
        ]
      : []),
    ...l.people.map((p) => ({
      value: `person:${p.email}`,
      label: p.name,
      keywords: `${p.name} ${p.email}`,
      group: 'Someone on your team',
    })),
  ];
}

/** "Hi {{firstName}}" reads as "Hi [First name]" on the canvas. */
const readable = (text = '', l?: Lookups) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => {
    const hit = l?.variables.find((x) => x.key === key);
    return hit ? `[${hit.label}]` : m;
  });

const label = (options: Option[], value: string | undefined, fallback = '…') => {
  const hit = options.find((o) => o.value === value)?.label;
  return typeof hit === 'string'
    ? hit
    : value?.replace(/^(name|type|dept|job|person):/, '') || fallback;
};
const lower = (s: string) => (s.startsWith('Any') ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const jobText = (v: Values, l?: Lookups) =>
  !v.job || v.job === 'any' ? 'any job' : l ? lower(label(jobOptions(l), v.job)) : 'one job';
const stageText = (v: Values, l?: Lookups, key = 'stage') =>
  !v[key] || v[key] === 'any'
    ? 'any stage'
    : l
      ? lower(label(stageOptions(l, { any: true, hired: true }), v[key]))
      : v[key].replace(/^(name|type):/, '');
const days = (v: Values) => `${v.days || '?'} ${v.days === '1' ? 'day' : 'days'}`;
/** "1 days" reads as "1 day". */
export const duration = (d = '') => d.replace(/^1 (.*)s$/, '1 $1');

const jobField: FieldDef = { key: 'job', label: 'Which jobs', type: 'search', options: jobOptions };
const daysField: FieldDef = { key: 'days', label: 'After how many days', type: 'number' };

const CONDITION_OPERATORS = (field: string, l: Lookups): Option[] => {
  const type = l.fields.find((f) => f.value === field)?.type;
  if (field === 'replied')
    return [
      { value: 'is', label: 'is' },
      { value: 'is not', label: 'is not' },
    ];
  if (field === 'tags')
    return [
      { value: 'is', label: 'includes' },
      { value: 'is not', label: 'does not include' },
      { value: 'contains', label: 'has a tag containing' },
      { value: 'does not contain', label: 'has no tag containing' },
    ];
  return type === 'number'
    ? ['is', 'is not', 'greater than', 'less than'].map((x) => ({ value: x, label: x }))
    : ['is', 'is not', 'contains', 'does not contain'].map((x) => ({ value: x, label: x }));
};

/** The choices for a condition's value, when the field has a fixed set. Null means type it in. */
export function valueOptions(field: string, l: Lookups): Option[] | null {
  switch (field) {
    case 'replied':
      return [
        { value: 'yes', label: 'Yes, since this run started' },
        { value: 'no', label: 'No' },
      ];
    case 'stage':
      return l.stages.map((s) => ({ value: s.name, label: s.name }));
    case 'stageType':
      return l.stageTypes.map((t) => ({ value: t, label: t }));
    case 'status':
      return ['Active', 'Rejected', 'Withdrawn', 'Hired'].map((x) => ({ value: x, label: x }));
    case 'source':
      return l.sources.map((x) => ({ value: x, label: x }));
    case 'department':
      return l.departments.map((x) => ({ value: x, label: x }));
    case 'job':
      return l.jobs.map((j) => ({ value: j.title, label: j.title }));
    case 'tags':
      return l.tags.map((x) => ({ value: x, label: x }));
  }
  const custom = l.fields.find((f) => f.value === field);
  return custom?.options ? custom.options.map((x) => ({ value: x, label: x })) : null;
}

const fieldLabel = (field: string, l?: Lookups) =>
  l?.fields.find((f) => f.value === field)?.label ?? field.replace(/^custom:/, '');

const event = (
  kind: string,
  label: string,
  help: string,
  icon: LucideIcon,
  sentence: string,
): StepDef => ({
  kind,
  group: 'Triggers',
  label,
  help,
  icon,
  fields: [jobField],
  defaults: { job: 'any' },
  summary: (v, l) => `${sentence} · ${jobText(v, l)}`,
});

export const STEPS: StepDef[] = [
  // ----- Triggers
  {
    kind: 'trigger.application_created',
    group: 'Triggers',
    label: 'New application',
    help: 'Starts when someone applies, or your team adds them to a job.',
    icon: UserPlus,
    fields: [
      jobField,
      {
        key: 'source',
        label: 'Where they came from',
        type: 'select',
        options: (l) => anyOr('Any source', l.sources),
      },
    ],
    defaults: { job: 'any', source: 'any' },
    summary: (v, l) =>
      `Someone applies for ${jobText(v, l)}${v.source && v.source !== 'any' ? ` from ${v.source}` : ''}`,
  },
  {
    kind: 'trigger.stage_entered',
    group: 'Triggers',
    label: 'Moves into a stage',
    help: 'Starts when someone moves a candidate into the stage you pick.',
    icon: MoveRight,
    fields: [
      {
        key: 'stage',
        label: 'Stage',
        type: 'search',
        options: (l) => stageOptions(l, { any: true, hired: true }),
      },
      jobField,
    ],
    defaults: { stage: 'type:Interview', job: 'any' },
    summary: (v, l) => `Moves into ${stageText(v, l)} · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.stage_left',
    group: 'Triggers',
    label: 'Leaves a stage',
    help: 'Starts when a candidate moves out of the stage you pick.',
    icon: LogOut,
    fields: [
      {
        key: 'stage',
        label: 'Stage',
        type: 'search',
        options: (l) => stageOptions(l, { any: true, hired: true }),
      },
      jobField,
    ],
    defaults: { stage: 'type:Screen', job: 'any' },
    summary: (v, l) => `Leaves ${stageText(v, l)} · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.candidate_rejected',
    group: 'Triggers',
    label: 'Candidate rejected',
    help: 'Starts when your team rejects a candidate.',
    icon: UserX,
    fields: [
      {
        key: 'reason',
        label: 'Reason',
        type: 'select',
        options: (l) =>
          anyOr(
            'Any reason',
            l.reasons.filter((r) => r !== 'Withdrew'),
          ),
      },
      jobField,
    ],
    defaults: { reason: 'any', job: 'any' },
    summary: (v, l) =>
      `Rejected${v.reason && v.reason !== 'any' ? ` for “${v.reason}”` : ''} · ${jobText(v, l)}`,
  },
  event(
    'trigger.interview_scheduled',
    'Interview scheduled',
    'Starts when an interview gets a confirmed time.',
    CalendarPlus,
    'An interview is scheduled',
  ),
  event(
    'trigger.interview_completed',
    'Interview finished',
    'Starts when an interview is marked as done.',
    CalendarCheck2,
    'An interview is marked done',
  ),
  event(
    'trigger.interview_no_show',
    'Interview no-show',
    'Starts when an interview is marked as a no-show.',
    CalendarX2,
    'Someone missed an interview',
  ),
  {
    kind: 'trigger.scorecard_submitted',
    group: 'Triggers',
    label: 'Scorecard submitted',
    help: 'Starts when an interviewer sends in their scorecard.',
    icon: ClipboardCheck,
    fields: [
      {
        key: 'recommendation',
        label: 'Their recommendation',
        type: 'select',
        options: () => [
          { value: 'any', label: 'Any recommendation' },
          { value: 'positive', label: 'Yes or strong yes' },
          { value: 'mixed', label: 'Mixed' },
          { value: 'negative', label: 'No or strong no' },
        ],
      },
      jobField,
    ],
    defaults: { recommendation: 'any', job: 'any' },
    summary: (v, l) =>
      `${
        { positive: 'A yes', mixed: 'A mixed', negative: 'A no' }[v.recommendation] ?? 'A'
      } scorecard is sent · ${jobText(v, l)}`,
  },
  event(
    'trigger.offer_sent',
    'Offer sent',
    'Starts when an offer goes to the candidate.',
    Send,
    'An offer is sent',
  ),
  event(
    'trigger.offer_accepted',
    'Candidate accepts offer',
    'Starts when the candidate’s yes to an offer is recorded.',
    FileCheck2,
    'The candidate accepts',
  ),
  event(
    'trigger.offer_declined',
    'Candidate declines offer',
    'Starts when the candidate’s no to an offer is recorded.',
    FileX2,
    'The candidate declines',
  ),
  event(
    'trigger.candidate_replied',
    'Candidate replies',
    'Starts when the candidate writes to you, in the portal or by email.',
    MessageSquareReply,
    'The candidate writes to you',
  ),
  {
    kind: 'trigger.tag_added',
    group: 'Triggers',
    label: 'Tag added',
    help: 'Starts when a candidate gets the tag you pick. Runs for each of their open applications.',
    icon: Tag,
    fields: [
      {
        key: 'tag',
        label: 'Tag',
        type: 'value',
        options: (l) => l.tags.map((t) => ({ value: t, label: t })),
      },
    ],
    defaults: { tag: '' },
    summary: (v) => (v.tag ? `The tag “${v.tag}” is added` : 'A tag is added'),
  },
  {
    kind: 'trigger.assessment_completed',
    group: 'Triggers',
    label: 'Assessment completed',
    help: 'Starts when a candidate finishes an assessment, or its result is entered. Its score can be checked next.',
    icon: FilePenLine,
    fields: [
      {
        key: 'assessment',
        label: 'Assessment',
        type: 'search',
        options: (l) => assessmentOptions(l),
      },
      jobField,
    ],
    defaults: { assessment: 'any', job: 'any' },
    summary: (v, l) =>
      `${!v.assessment || v.assessment === 'any' ? 'Any assessment' : l ? label(assessmentOptions(l), v.assessment) : 'An assessment'} is completed · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.assessment_unfinished',
    group: 'Triggers',
    label: 'Assessment not finished',
    help: 'Starts when a candidate has not finished an assessment after the days set on that assessment.',
    icon: FileClock,
    fields: [
      {
        key: 'assessment',
        label: 'Assessment',
        type: 'search',
        options: (l) => assessmentOptions(l),
      },
      jobField,
    ],
    defaults: { assessment: 'any', job: 'any' },
    summary: (v, l) =>
      `${!v.assessment || v.assessment === 'any' ? 'Any assessment' : l ? label(assessmentOptions(l), v.assessment) : 'An assessment'} not finished · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.stuck',
    group: 'Triggers',
    label: 'Stuck in a stage',
    help: 'Starts when an application sits in one stage with no activity for a number of days.',
    icon: Hourglass,
    fields: [
      { ...daysField, label: 'Days with no activity' },
      {
        key: 'stage',
        label: 'Stage',
        type: 'search',
        options: (l) => stageOptions(l, { any: true }),
      },
      jobField,
    ],
    defaults: { days: '5', stage: 'any', job: 'any' },
    summary: (v, l) => `No activity for ${days(v)} in ${stageText(v, l)} · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.booking_unanswered',
    group: 'Triggers',
    label: 'Interview time not picked',
    help: 'Starts when a candidate was asked to pick an interview time and has not.',
    icon: CalendarClock,
    fields: [daysField, jobField],
    defaults: { days: '2', job: 'any' },
    summary: (v, l) => `No time picked after ${days(v)} · ${jobText(v, l)}`,
  },
  {
    kind: 'trigger.scorecard_overdue',
    group: 'Triggers',
    label: 'Feedback overdue',
    help: 'Starts for each interview that ended this many days ago and still misses a scorecard.',
    icon: ClipboardX,
    fields: [{ ...daysField, label: 'Days after the interview' }, jobField],
    defaults: { days: '2', job: 'any' },
    summary: (v, l) => `Scorecard missing ${days(v)} after an interview · ${jobText(v, l)}`,
  },

  // ----- Logic
  {
    kind: 'logic.condition',
    group: 'Logic',
    label: 'Yes or no check',
    help: 'Checks one detail. A match goes down the Yes path, anyone else down the No path.',
    icon: GitBranch,
    fields: [
      {
        key: 'field',
        label: 'Detail to check',
        type: 'select',
        options: (l) => l.fields.map((f) => ({ value: f.value, label: f.label })),
      },
      {
        key: 'operator',
        label: 'Rule',
        type: 'select',
        options: (l, v) => CONDITION_OPERATORS(v.field, l),
      },
      {
        key: 'value',
        label: 'Value',
        type: 'value',
        options: (l, v) => valueOptions(v.field, l) ?? [],
      },
    ],
    defaults: { field: 'replied', operator: 'is', value: 'yes' },
    summary: (v, l) => {
      if (v.field === 'replied')
        return v.operator === 'is not'
          ? 'Has the candidate not replied?'
          : 'Has the candidate replied?';
      const op =
        v.field === 'tags'
          ? ({
              'is not': 'does not include',
              contains: 'has a tag containing',
              'does not contain': 'has no tag containing',
            }[v.operator] ?? 'includes')
          : v.operator;
      return `${fieldLabel(v.field, l)} ${op} ${v.value ? `“${v.value}”` : '…'}`;
    },
    outputs: () => [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    kind: 'logic.wait',
    group: 'Logic',
    label: 'Wait',
    help: 'Pauses here for a set time, or until a date such as the interview, before going on.',
    icon: Clock,
    fields: [
      {
        key: 'mode',
        label: 'Wait',
        type: 'select',
        options: () => [
          { value: 'time', label: 'For a set time' },
          { value: 'date', label: 'Until a date' },
        ],
      },
      { key: 'duration', label: 'Wait for', type: 'duration', show: (v) => v.mode !== 'date' },
      {
        key: 'window',
        label: 'Then go on',
        type: 'select',
        show: (v) => v.mode !== 'date',
        options: () => [
          { value: 'any', label: 'Straight away' },
          { value: 'business', label: 'In business hours (9:00 to 17:00 on weekdays)' },
        ],
      },
      {
        key: 'date',
        label: 'Date',
        type: 'select',
        show: (v) => v.mode === 'date',
        options: (l) => (l.dates ?? []).map((d) => ({ value: d.value, label: d.label })),
        description: (_, v) =>
          v.date === 'interview'
            ? 'The interview that started this run, else the next one booked. If it moves, the wait moves too.'
            : 'If there is no such date, the step is skipped and the run goes on.',
      },
      {
        key: 'offset',
        label: 'How long',
        type: 'duration',
        show: (v) => v.mode === 'date',
        units: ['minutes', 'hours', 'days', 'weeks'],
      },
      {
        key: 'direction',
        label: 'Before or after',
        type: 'select',
        show: (v) => v.mode === 'date',
        options: () => [
          { value: 'before', label: 'Before the date' },
          { value: 'after', label: 'After the date' },
        ],
      },
    ],
    defaults: {
      mode: 'time',
      duration: '2 days',
      window: 'any',
      date: 'interview',
      offset: '1 days',
      direction: 'before',
    },
    summary: (v, l) => {
      if (v.mode !== 'date')
        return `Wait ${duration(v.duration)}${v.window === 'business' ? ', then go on in business hours' : ''}`;
      const date = (l?.dates?.find((d) => d.value === v.date)?.label ?? 'the date').toLowerCase();
      return v.offset && !v.offset.startsWith('0 ')
        ? `Wait until ${duration(v.offset)} ${v.direction === 'after' ? 'after' : 'before'} the ${date}`
        : `Wait until the ${date}`;
    },
  },
  {
    kind: 'logic.split',
    group: 'Logic',
    label: 'Split into paths',
    help: 'Sends each candidate down a path based on one detail about them.',
    icon: Split,
    fields: [
      {
        key: 'field',
        label: 'Detail to split on',
        type: 'select',
        options: (l) =>
          l.fields
            .filter((f) => f.value !== 'replied')
            .map((f) => ({ value: f.value, label: f.label })),
      },
      {
        key: 'branches',
        label: 'Paths',
        type: 'tags',
        options: (l, v) => valueOptions(v.field, l) ?? [],
        description: 'Add one path for each value. Anyone who matches none goes down Other.',
      },
    ],
    defaults: { field: 'department', branches: '' },
    summary: (v, l) => `By ${fieldLabel(v.field, l).toLowerCase()}`,
    outputs: (v) => [
      ...splitValues(v.branches).map((b) => ({ id: `v:${b}`, label: b })),
      { id: 'other', label: 'Other' },
    ],
  },

  // ----- Actions
  {
    kind: 'action.send_email',
    group: 'Actions',
    label: 'Send email',
    help: 'Sends an email. Details like the first name fill in for each candidate.',
    icon: Mail,
    fields: [
      {
        key: 'to',
        label: 'To',
        type: 'search',
        options: (l) => recipientOptions(l, true),
      },
      {
        key: 'template',
        label: 'Email',
        type: 'select',
        options: (l) => [
          { value: '', label: 'Write my own' },
          ...l.templates.map((t) => ({ value: t.key, label: t.label, group: 'Automatic emails' })),
        ],
        description: (_, v) =>
          v.template
            ? 'Uses the wording in Messages, then Templates, including any per-job wording.'
            : undefined,
      },
      { key: 'subject', label: 'Subject', type: 'text', variables: true, show: (v) => !v.template },
      {
        key: 'body',
        label: 'Message',
        type: 'textarea',
        variables: true,
        show: (v) => !v.template,
      },
    ],
    defaults: {
      to: 'candidate',
      template: '',
      subject: 'An update on your application',
      body: 'Hi {{firstName}},\n\n',
    },
    summary: (v, l) => {
      const to = l ? label(recipientOptions(l, true), v.to) : 'someone';
      const what = v.template
        ? (l?.templates.find((t) => t.key === v.template)?.label ?? 'an automatic email')
        : `“${readable(v.subject, l) || 'no subject'}”`;
      return `To ${lower(to.replace(/^The /, 'the '))}: ${what}`;
    },
  },
  {
    kind: 'action.notify',
    group: 'Actions',
    label: 'Alert a teammate',
    help: 'Sends someone on your team a short alert with a link to the application.',
    icon: Bell,
    fields: [
      {
        key: 'channel',
        label: 'Send by',
        type: 'select',
        options: () => [
          { value: 'inapp', label: 'Notification in MyThorneAI' },
          { value: 'email', label: 'Email' },
          { value: 'team', label: 'Your team channel (Slack or Teams)' },
        ],
        description: (l, v) =>
          v.channel === 'team' && !l.teamChannel
            ? 'No team channel is set up yet. Add one in Reminders and alerts, or this step is skipped.'
            : v.channel === 'inapp'
              ? 'It shows in their bell. They also get an email unless they turned that off in their notification settings.'
              : undefined,
      },
      {
        key: 'who',
        label: 'Who',
        type: 'search',
        options: (l) => recipientOptions(l, false).filter((o) => o.value !== 'candidate'),
        show: (v) => v.channel !== 'team',
      },
      { key: 'message', label: 'Message', type: 'textarea', variables: true },
    ],
    defaults: {
      channel: 'inapp',
      who: 'recruiter',
      message: '{{candidateName}} needs your attention on {{jobTitle}}.',
    },
    summary: (v, l) =>
      v.channel === 'team'
        ? 'Post to your team channel'
        : `Alert ${l ? lower(label(recipientOptions(l, false), v.who).replace(/^The /, 'the ')) : 'a teammate'}${v.channel === 'email' ? ' by email' : ''}`,
  },
  {
    kind: 'action.move_stage',
    group: 'Actions',
    label: 'Change stage',
    help: 'Moves the candidate to another stage of their job. Hired is reached only through an offer.',
    icon: MoveRight,
    fields: [
      {
        key: 'stage',
        label: 'New stage',
        type: 'search',
        options: (l) => stageOptions(l),
        description: 'By kind picks the first such stage in each job.',
      },
    ],
    defaults: { stage: 'type:Screen' },
    summary: (v, l) => `Move to ${stageText(v, l)}`,
  },
  {
    kind: 'action.reject',
    group: 'Actions',
    label: 'Reject',
    help: 'Rejects the application with a reason, like the Reject button does.',
    icon: XCircle,
    fields: [
      {
        key: 'reason',
        label: 'Reason',
        type: 'select',
        options: (l) =>
          l.reasons.map((r) => ({ value: r, label: r === 'Withdrew' ? 'They withdrew' : r })),
      },
      {
        key: 'email',
        label: 'Rejection email',
        type: 'select',
        options: () => [
          { value: 'yes', label: 'Send the rejection email' },
          { value: 'no', label: 'Don’t email the candidate' },
        ],
      },
    ],
    defaults: { reason: '', email: 'yes' },
    summary: (v) =>
      `Reject${v.reason ? ` for “${v.reason}”` : ''}${v.email === 'yes' ? ' and email them' : ''}`,
  },
  {
    kind: 'action.add_tag',
    group: 'Actions',
    label: 'Add tag',
    help: 'Adds tags to the candidate so you can find them later.',
    icon: Tag,
    fields: [
      {
        key: 'tags',
        label: 'Tags',
        type: 'tags',
        options: (l) => l.tags.map((t) => ({ value: t, label: t })),
      },
    ],
    defaults: { tags: '' },
    summary: (v) =>
      `Tag ${
        splitValues(v.tags)
          .map((t) => `“${t}”`)
          .join(', ') || '…'
      }`,
  },
  {
    kind: 'action.remove_tag',
    group: 'Actions',
    label: 'Remove tag',
    help: 'Takes tags off the candidate.',
    icon: TagsIcon,
    fields: [
      {
        key: 'tags',
        label: 'Tags',
        type: 'tags',
        options: (l) => l.tags.map((t) => ({ value: t, label: t })),
      },
    ],
    defaults: { tags: '' },
    summary: (v) =>
      `Remove ${
        splitValues(v.tags)
          .map((t) => `“${t}”`)
          .join(', ') || '…'
      }`,
  },
  {
    kind: 'action.approval',
    group: 'Actions',
    label: 'Ask for approval',
    help: 'Asks people to approve before going on. Approved goes one way; a rejection goes the other.',
    icon: ShieldCheck,
    fields: [
      {
        key: 'approvers',
        label: 'Approvers',
        type: 'tags',
        options: (l) => [
          { value: 'recruiter', label: 'The job’s recruiter', group: 'From the application' },
          {
            value: 'hiringManager',
            label: 'The job’s hiring manager',
            group: 'From the application',
          },
          ...l.people
            .filter((p) => p.role !== 'Interviewer')
            .map((p) => ({
              value: `person:${p.email}`,
              label: p.name,
              keywords: `${p.name} ${p.email}`,
              group: 'Someone on your team',
            })),
        ],
        description: 'Admins, recruiters and hiring managers can approve.',
      },
      {
        key: 'mode',
        label: 'How they decide',
        type: 'select',
        options: () => [
          { value: 'Parallel', label: 'Everyone must approve' },
          { value: 'Sequential', label: 'Everyone, one after another in this order' },
          { value: 'AnyOne', label: 'Any one approval is enough' },
        ],
      },
      {
        key: 'question',
        label: 'What to approve',
        type: 'text',
        variables: true,
        description: 'The approvers see this in their approvals list and in the email.',
      },
    ],
    defaults: {
      approvers: 'hiringManager',
      mode: 'Parallel',
      question: 'Move {{candidateName}} forward for {{jobTitle}}',
    },
    summary: (v, l) => {
      const options = l ? STEPS_BY_KIND_APPROVERS(l) : [];
      const names = splitValues(v.approvers).map((x) => label(options, x).replace(/^The /, 'the '));
      const list =
        names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
      return list ? `Ask ${list} to approve` : 'Ask for approval';
    },
    outputs: () => [
      { id: 'yes', label: 'Approved' },
      { id: 'no', label: 'Not approved' },
    ],
  },
  {
    kind: 'action.send_assessment',
    group: 'Actions',
    label: 'Send assessment',
    help: 'Sends the candidate an assessment, the same as the Send assessment button. Anyone who already has it open is skipped.',
    icon: ClipboardList,
    fields: [
      {
        key: 'assessment',
        label: 'Assessment',
        type: 'search',
        options: (l) => [
          {
            value: 'stage',
            label: 'The assessment set on the stage they entered',
            group: 'From the stage',
          },
          ...(l.assessments ?? []).map((a) => ({
            value: a.id,
            label: a.published === false ? `${a.name} (not published)` : a.name,
            disabled: a.published === false,
            group: 'One assessment',
          })),
        ],
        description: (l, v) =>
          v.assessment === 'stage'
            ? 'Set each stage’s assessment in the job’s stages. Stages without one are skipped, and nobody gets it twice for one application.'
            : (l.assessments ?? []).some((a) => a.published !== false)
              ? 'It is due after the number of days set on the assessment.'
              : 'Publish an assessment in Assessments first.',
      },
    ],
    defaults: { assessment: '' },
    summary: (v, l) => {
      if (v.assessment === 'stage') return 'Send the stage’s assessment';
      const name = l?.assessments?.find((a) => a.id === v.assessment)?.name;
      return name ? `Send “${name}”` : 'Send an assessment';
    },
  },
  {
    kind: 'action.webhook',
    group: 'Actions',
    label: 'Send to another app',
    help: 'Sends the application to one of your webhooks, so another app can act on it. The data is signed.',
    icon: Webhook,
    fields: [
      {
        key: 'endpoint',
        label: 'Webhook',
        type: 'select',
        options: (l) =>
          l.webhooks.map((w) => ({
            value: w.id,
            label: `${w.url.replace(/^https?:\/\//, '')}${w.isActive ? '' : ' (paused)'}`,
          })),
        description: (l) =>
          l.webhooks.length === 0 ? 'Add a webhook in Settings, then Webhooks, first.' : undefined,
      },
    ],
    defaults: { endpoint: '' },
    summary: (v, l) => {
      const url = l?.webhooks.find((w) => w.id === v.endpoint)?.url;
      return url ? `Send to ${url.replace(/^https?:\/\//, '')}` : 'Send to a webhook';
    },
  },
];

function STEPS_BY_KIND_APPROVERS(l: Lookups) {
  return byKind.get('action.approval')?.fields[0].options?.(l, {}) ?? [];
}

const byKind = new Map(STEPS.map((s) => [s.kind, s]));
const UNKNOWN: StepDef = {
  kind: 'unknown',
  group: 'Actions',
  label: 'Unknown step',
  help: 'This kind of step is no longer available. Delete it.',
  icon: XCircle,
  fields: [],
  defaults: {},
  summary: () => 'Delete this step',
};
export const defOf = (kind: string) => byKind.get(kind) ?? UNKNOWN;
export const isTrigger = (kind: string) => kind.startsWith('trigger.');
export const titleOf = (n: Pick<GraphNode, 'kind' | 'values'>) =>
  n.values.name || defOf(n.kind).label;
export const outputsOf = (n: Pick<GraphNode, 'kind' | 'values'>) =>
  defOf(n.kind).outputs?.(n.values) ?? null;
export function splitValues(s = '') {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
export const outputLabel = (handle: string | null | undefined) =>
  handle === 'yes'
    ? 'Yes'
    : handle === 'no'
      ? 'No'
      : handle === 'other'
        ? 'Other'
        : (handle?.replace(/^v:/, '') ?? '');
