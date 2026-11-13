'use client';

import { createContext, useContext } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Bell,
  CalendarCheck2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  FileSignature,
  GitBranch,
  GitFork,
  Mail,
  MoveRight,
  Split,
  Tag,
  UserPlus,
  UserX,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// Everything the editor knows about each kind of step: palette entry, inspector fields, the
// one-line summary on the canvas, and the outputs (handles) it exposes.

export type Values = Record<string, string>;
export type StepData = { kind: string; values: Values };
export type StepNode = Node<StepData, 'step'>;

export type FieldDef = {
  key: string;
  label: string;
  type: 'select' | 'text' | 'textarea' | 'duration' | 'tags';
  options?: string[];
  placeholder?: string;
  description?: string;
  /** Extra values to set when this field changes (an email template fills subject and body). */
  apply?: (value: string) => Values;
};
export type Output = { id: string; label: string };
export type Group = 'Triggers' | 'Logic' | 'Approvals' | 'Actions';
export type StepDef = {
  kind: string;
  group: Group;
  label: string;
  eyebrow: string;
  /** One plain sentence on what the step does, shown under its name in the inspector. */
  help: string;
  icon: LucideIcon;
  fields: FieldDef[];
  defaults: Values;
  summary: (v: Values) => string;
  /** Several labelled outputs. Without it, a step has one plain output. */
  outputs?: (v: Values) => Output[];
  /** Every output must be connected (Yes and No, Approved and Rejected). */
  branching?: boolean;
};

export const JOBS = ['Any job', 'Engineering jobs', 'Sales jobs', 'Design jobs', 'Jobs I own'];
export const STAGES = [
  'Applied',
  'Screening',
  'Phone screen',
  'Interview',
  'Final interview',
  'Offer',
  'Hired',
  'Rejected',
];
export const CANDIDATE_FIELDS = [
  'Stage',
  'Source',
  'Rating',
  'Location',
  'Department',
  'Tags',
  'Years of experience',
];
export const DURATION_UNITS = ['minutes', 'hours', 'days', 'business days', 'weeks'];
const PEOPLE = ['Recruiter', 'Hiring manager', 'Interviewers', 'Approver', 'Recruiting lead'];
export const EMAIL_VARIABLES = [
  '{{candidate.first_name}}',
  '{{candidate.full_name}}',
  '{{job.title}}',
  '{{company.name}}',
  '{{recruiter.name}}',
  '{{interview.date}}',
  '{{portal.link}}',
];

export const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  'Interview invitation': {
    subject: 'Your interview for {{job.title}}',
    body: 'Hi {{candidate.first_name}},\n\nThanks for confirming. Your interview for {{job.title}} is on {{interview.date}}. You will get a calendar invitation with the details shortly.\n\nSee you then,\n{{recruiter.name}}',
  },
  'Application received': {
    subject: 'We received your application',
    body: 'Hi {{candidate.first_name}},\n\nThanks for applying for {{job.title}} at {{company.name}}. We read every application and will be in touch within a week. You can follow your application at {{portal.link}}.\n\n{{recruiter.name}}',
  },
  'Rejection after interview': {
    subject: 'Your application for {{job.title}}',
    body: 'Hi {{candidate.first_name}},\n\nThank you for the time you spent with our team. We have decided to move forward with other candidates for {{job.title}}. We will keep your details on file and reach out if a better match opens up.\n\nAll the best,\n{{recruiter.name}}',
  },
  'Offer letter': {
    subject: 'Your offer from {{company.name}}',
    body: 'Hi {{candidate.first_name}},\n\nWe are delighted to offer you the {{job.title}} role. Your offer letter is ready to review and sign at {{portal.link}}.\n\n{{recruiter.name}}',
  },
};

const step = (d: Omit<StepDef, 'eyebrow'> & { eyebrow?: string }): StepDef => ({
  eyebrow: d.group === 'Triggers' ? 'Starts when' : d.group === 'Approvals' ? 'Approval' : 'Action',
  ...d,
});
const jobField: FieldDef = { key: 'job', label: 'Which jobs', type: 'select', options: JOBS };
const yesNo: Output[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];
/** "1 days" reads as "1 day". */
const dur = (d = '') => d.replace(/^1 (.*)s$/, '1 $1');

export const STEPS: StepDef[] = [
  // Triggers
  step({
    kind: 'trigger.stage_entered',
    group: 'Triggers',
    label: 'Candidate moves stage',
    help: 'Starts when someone moves a candidate to the stage you pick.',
    icon: MoveRight,
    fields: [{ key: 'stage', label: 'Stage', type: 'select', options: STAGES }, jobField],
    defaults: { stage: 'Interview', job: 'Any job' },
    summary: (v) => `A candidate moves to ${v.stage} · ${v.job}`,
  }),
  step({
    kind: 'trigger.application_created',
    group: 'Triggers',
    label: 'New application',
    help: 'Starts when someone applies for a job.',
    icon: UserPlus,
    fields: [
      jobField,
      {
        key: 'source',
        label: 'Where they applied from',
        type: 'select',
        options: ['Any source', 'Careers page', 'Referral', 'LinkedIn', 'Agency'],
      },
    ],
    defaults: { job: 'Any job', source: 'Any source' },
    summary: (v) => `New application from ${v.source.toLowerCase()} · ${v.job}`,
  }),
  step({
    kind: 'trigger.interview_completed',
    group: 'Triggers',
    label: 'Interview finished',
    help: 'Starts when an interview is marked as done.',
    icon: CalendarCheck2,
    fields: [
      {
        key: 'interview',
        label: 'Interview type',
        type: 'select',
        options: ['Any interview', 'Phone screen', 'Technical', 'Onsite', 'Final'],
      },
      jobField,
    ],
    defaults: { interview: 'Any interview', job: 'Any job' },
    summary: (v) => `${v.interview} is marked done · ${v.job}`,
  }),
  step({
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
        options: ['Any recommendation', 'Yes or strong yes', 'Mixed', 'No or strong no'],
      },
      jobField,
    ],
    defaults: { recommendation: 'Any recommendation', job: 'Any job' },
    summary: (v) => `Scorecard with ${v.recommendation.toLowerCase()} · ${v.job}`,
  }),
  step({
    kind: 'trigger.offer_accepted',
    group: 'Triggers',
    label: 'Offer accepted',
    help: 'Starts when a candidate signs their offer.',
    icon: FileSignature,
    fields: [jobField],
    defaults: { job: 'Any job' },
    summary: (v) => `The candidate signs the offer · ${v.job}`,
  }),
  step({
    kind: 'trigger.candidate_rejected',
    group: 'Triggers',
    label: 'Candidate rejected',
    help: 'Starts when someone rejects a candidate.',
    icon: UserX,
    fields: [
      {
        key: 'reason',
        label: 'Reason',
        type: 'select',
        options: [
          'Any reason',
          'Not qualified',
          'Position filled',
          'Withdrew',
          'Did not pass interview',
        ],
      },
      {
        key: 'afterStage',
        label: 'Only if they reached',
        type: 'select',
        options: STAGES,
        description: 'Skips candidates rejected before this stage.',
      },
    ],
    defaults: { reason: 'Any reason', afterStage: 'Interview' },
    summary: (v) => `${v.reason} · reached ${v.afterStage} or later`,
  }),
  // Logic
  step({
    kind: 'logic.condition',
    group: 'Logic',
    label: 'Yes or no check',
    eyebrow: 'Check',
    help: 'Checks one detail about the candidate. A match goes down the Yes path, anyone else goes down the No path.',
    icon: GitBranch,
    fields: [
      { key: 'field', label: 'Detail to check', type: 'select', options: CANDIDATE_FIELDS },
      {
        key: 'operator',
        label: 'Rule',
        type: 'select',
        options: ['is', 'is not', 'contains', 'greater than', 'less than'],
      },
      { key: 'value', label: 'Value', type: 'text', placeholder: 'For example, Referral' },
    ],
    defaults: { field: 'Source', operator: 'is', value: 'Referral' },
    summary: (v) => `${v.field} ${v.operator} ${v.value || '…'}`,
    outputs: () => yesNo,
    branching: true,
  }),
  step({
    kind: 'logic.wait',
    group: 'Logic',
    label: 'Wait a set time',
    eyebrow: 'Wait',
    help: 'Pauses here before going on to the next step.',
    icon: Clock,
    fields: [
      { key: 'duration', label: 'Wait for', type: 'duration' },
      {
        key: 'window',
        label: 'Then go on',
        type: 'select',
        options: ['Any time', 'During business hours', 'Next weekday morning'],
      },
    ],
    defaults: { duration: '2 days', window: 'During business hours' },
    summary: (v) => `Wait ${dur(v.duration)}, then go on ${v.window.toLowerCase()}`,
  }),
  step({
    kind: 'logic.split',
    group: 'Logic',
    label: 'Split into paths',
    eyebrow: 'Split',
    help: 'Sends each candidate down a different path, based on one detail about them.',
    icon: Split,
    fields: [
      { key: 'field', label: 'Detail to split on', type: 'select', options: CANDIDATE_FIELDS },
      {
        key: 'branches',
        label: 'Paths',
        type: 'tags',
        description: 'Add one path for each value. Anyone who matches none goes down Other.',
      },
    ],
    defaults: { field: 'Department', branches: 'Engineering, Sales' },
    summary: (v) => `By ${v.field.toLowerCase()}`,
    outputs: (v) => [
      ...splitValues(v.branches).map((b) => ({ id: `v:${b}`, label: b })),
      { id: 'other', label: 'Other' },
    ],
  }),
  // Approvals
  step({
    kind: 'approval.request',
    group: 'Approvals',
    label: 'Ask for approval',
    help: 'Waits for someone to approve or reject, then follows the matching path.',
    icon: CheckSquare,
    fields: [
      {
        key: 'approver',
        label: 'Who approves',
        type: 'select',
        options: [
          'Hiring manager',
          'Recruiting lead',
          'Department head',
          'Finance',
          'Specific person',
        ],
      },
      {
        key: 'person',
        label: 'Person',
        type: 'text',
        placeholder: 'Name or email',
        description: 'Only needed when you pick Specific person.',
      },
      { key: 'due', label: 'They have', type: 'duration' },
      {
        key: 'timeout',
        label: 'If nobody answers',
        type: 'select',
        options: [
          'Remind the approver',
          'Escalate to recruiting lead',
          'Approve automatically',
          'Reject automatically',
        ],
      },
      {
        key: 'note',
        label: 'Message to the approver',
        type: 'textarea',
        placeholder: 'What should they check?',
      },
    ],
    defaults: {
      approver: 'Hiring manager',
      person: '',
      due: '2 business days',
      timeout: 'Remind the approver',
      note: '',
    },
    summary: (v) =>
      `${v.approver === 'Specific person' && v.person ? v.person : v.approver} · within ${dur(v.due)}`,
    outputs: () => [
      { id: 'approved', label: 'Approved' },
      { id: 'rejected', label: 'Rejected' },
    ],
    branching: true,
  }),
  // Actions
  step({
    kind: 'action.send_email',
    group: 'Actions',
    label: 'Send email',
    help: 'Sends an email. Placeholders fill in with each candidate’s details.',
    icon: Mail,
    fields: [
      { key: 'to', label: 'To', type: 'select', options: ['Candidate', ...PEOPLE] },
      {
        key: 'from',
        label: 'From',
        type: 'select',
        options: ['Recruiter', 'Hiring manager', 'No-reply address'],
      },
      {
        key: 'template',
        label: 'Template',
        type: 'select',
        options: ['Custom message', ...Object.keys(EMAIL_TEMPLATES)],
        apply: (t) => EMAIL_TEMPLATES[t] ?? {},
        description: 'Picking one fills in the subject and message.',
      },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'body', label: 'Message', type: 'textarea' },
    ],
    defaults: {
      to: 'Candidate',
      from: 'Recruiter',
      template: 'Custom message',
      subject: 'An update on your application',
      body: 'Hi {{candidate.first_name}},\n\n',
    },
    summary: (v) => `To ${v.to.toLowerCase()}: ${v.subject || 'no subject'}`,
  }),
  step({
    kind: 'action.notify',
    group: 'Actions',
    label: 'Alert a teammate',
    help: 'Sends a short alert to someone on your team.',
    icon: Bell,
    fields: [
      { key: 'who', label: 'Who', type: 'select', options: PEOPLE },
      {
        key: 'channel',
        label: 'Send by',
        type: 'select',
        options: ['In app', 'Email', 'Slack', 'Microsoft Teams'],
      },
      { key: 'message', label: 'Message', type: 'textarea' },
    ],
    defaults: {
      who: 'Recruiter',
      channel: 'In app',
      message: '{{candidate.full_name}} needs your attention on {{job.title}}.',
    },
    summary: (v) => `Alert the ${v.who.toLowerCase()} (${v.channel.toLowerCase()})`,
  }),
  step({
    kind: 'action.move_stage',
    group: 'Actions',
    label: 'Change stage',
    help: 'Moves the candidate to another stage.',
    icon: GitFork,
    fields: [
      { key: 'stage', label: 'New stage', type: 'select', options: STAGES },
      {
        key: 'reason',
        label: 'Reason',
        type: 'select',
        options: ['None', 'Not qualified', 'Position filled', 'Withdrew', 'Did not pass interview'],
        description: 'Only used when the new stage is Rejected.',
      },
    ],
    defaults: { stage: 'Screening', reason: 'None' },
    summary: (v) =>
      `Move to ${v.stage}${v.stage === 'Rejected' && v.reason !== 'None' ? ` · ${v.reason}` : ''}`,
  }),
  step({
    kind: 'action.create_task',
    group: 'Actions',
    label: 'Create task',
    help: 'Gives someone on your team a to-do with a due date.',
    icon: CheckSquare,
    fields: [
      {
        key: 'title',
        label: 'What to do',
        type: 'text',
        placeholder: 'For example, call the candidate',
      },
      { key: 'assignee', label: 'Assign to', type: 'select', options: PEOPLE },
      { key: 'due', label: 'Due in', type: 'duration' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Normal', 'High'] },
    ],
    defaults: {
      title: 'Review the candidate',
      assignee: 'Recruiter',
      due: '1 days',
      priority: 'Normal',
    },
    summary: (v) =>
      `Assign “${v.title || 'Task'}” to the ${v.assignee.toLowerCase()}, due in ${dur(v.due)}`,
  }),
  step({
    kind: 'action.add_tag',
    group: 'Actions',
    label: 'Add tag',
    help: 'Adds labels to the candidate so you can find them later.',
    icon: Tag,
    fields: [{ key: 'tags', label: 'Tags', type: 'tags' }],
    defaults: { tags: 'Follow up' },
    summary: (v) =>
      `Tag ${
        splitValues(v.tags)
          .map((t) => `“${t}”`)
          .join(', ') || '…'
      }`,
  }),
  step({
    kind: 'action.webhook',
    group: 'Actions',
    label: 'Send to another app',
    help: 'Sends candidate details to another app’s web address (a webhook), so that app can act on them. Ask whoever runs that app for the address.',
    icon: Webhook,
    fields: [
      { key: 'url', label: 'Web address', type: 'text', placeholder: 'https://' },
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: ['POST', 'PUT'],
        description: 'Most apps use POST. Change it only if the app asks for PUT.',
      },
      {
        key: 'payload',
        label: 'What to send',
        type: 'select',
        options: ['Candidate and application', 'Application only', 'Event only'],
      },
    ],
    defaults: {
      url: 'https://hooks.example.com/ats',
      method: 'POST',
      payload: 'Candidate and application',
    },
    summary: (v) => `Send to ${v.url.replace(/^https?:\/\//, '') || '…'}`,
  }),
];

export const GROUPS: Group[] = ['Triggers', 'Logic', 'Approvals', 'Actions'];
/** What each group is called on screen. */
export const GROUP_LABELS: Record<Group, string> = {
  Triggers: 'Start when',
  Logic: 'Check or wait',
  Approvals: 'Approvals',
  Actions: 'Then do',
};
const byKind = new Map(STEPS.map((s) => [s.kind, s]));
export const defOf = (kind: string) => byKind.get(kind) ?? STEPS[0];
export const titleOf = (d: StepData) => d.values.name || defOf(d.kind).label;
export const outputsOf = (d: StepData) => defOf(d.kind).outputs?.(d.values) ?? null;
export function splitValues(s = '') {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const tileTone: Record<Group, string> = {
  Triggers: 'bg-accent text-tone-blue-dot',
  Logic: 'bg-tone-gray-bg text-tone-gray-fg',
  Approvals: 'bg-tone-amber-bg text-tone-amber-fg',
  Actions: 'bg-tone-green-bg text-tone-green-fg',
};
export function StepIcon({ kind, className }: { kind: string; className?: string }) {
  const def = defOf(kind);
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md',
        tileTone[def.group],
        className,
      )}
    >
      <def.icon className="size-4" aria-hidden />
    </span>
  );
}

/** Canvas highlights that are not part of the saved graph: validation problems and the test run. */
export const Highlights = createContext<{
  problems: Set<string>;
  active: string | null;
  visited: Set<string> | null;
}>({ problems: new Set(), active: null, visited: null });

const handleClass = 'size-2.5! border-2! border-primary! bg-card!';

/** The canvas node: the WorkflowNode look (icon tile, KIND eyebrow, title, summary) plus handles. */
export function StepNodeView({ id, data, selected }: NodeProps<StepNode>) {
  const def = defOf(data.kind);
  const outputs = outputsOf(data);
  const { problems, active, visited } = useContext(Highlights);
  const isTrigger = def.group === 'Triggers';
  return (
    <div
      className={cn(
        'relative w-60 rounded-lg border bg-card p-3.5 text-left shadow-card transition-[border-color,box-shadow,opacity]',
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/50',
        problems.has(id) && 'border-destructive ring-2 ring-destructive/25',
        visited && !visited.has(id) && 'opacity-50',
        visited?.has(id) && active !== id && 'border-tone-green-dot',
        active === id && 'border-primary ring-4 ring-primary/30',
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className={handleClass} />}
      <div className="flex items-center gap-2">
        <StepIcon kind={data.kind} />
        <span className="flex-1 text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          {def.eyebrow}
        </span>
        {active === id && (
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-label="Running" />
        )}
      </div>
      <p className="mt-2.5 text-md leading-snug font-semibold text-fg">{titleOf(data)}</p>
      <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{def.summary(data.values)}</p>
      {outputs ? (
        <div className="-mx-3.5 mt-3 -mb-1.5 border-t border-border-subtle pt-1">
          {outputs.map((o) => (
            <div
              key={o.id}
              className="relative py-1 pr-4 text-right text-2xs font-medium text-fg-muted"
            >
              {o.label}
              <Handle type="source" position={Position.Right} id={o.id} className={handleClass} />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} className={handleClass} />
      )}
    </div>
  );
}

export const nodeTypes = { step: StepNodeView };
