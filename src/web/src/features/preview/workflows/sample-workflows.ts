'use client';

import { useEffect, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { useLocalStorageState } from '@/lib/hooks';
import { EMAIL_TEMPLATES, defOf, type StepNode, type Values } from './catalog';
import { layout } from './graph';

// Sample workflows, templates and test candidates. No backend yet: workflows live in this browser.

export type WorkflowStatus = 'Draft' | 'Active' | 'Paused';
export type Version = {
  id: string;
  savedAt: string;
  name: string;
  nodes: StepNode[];
  edges: Edge[];
};
export type Workflow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  updatedAt: string;
  runsThisWeek: number;
  nodes: StepNode[];
  edges: Edge[];
  versions: Version[];
};

export const statusTone = { Draft: 'gray', Active: 'green', Paused: 'amber' } as const;
export const MAX_VERSIONS = 10;
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Nodes for the graph helpers: which are triggers, which outputs must be connected. */
export function toGraph(nodes: StepNode[]) {
  return nodes.map((n) => {
    const def = defOf(n.data.kind);
    return {
      id: n.id,
      label: n.data.values.name || def.label,
      trigger: def.group === 'Triggers',
      branches: def.branching ? def.outputs?.(n.data.values) : undefined,
    };
  });
}

const emailOf = (template: string) => EMAIL_TEMPLATES[template];

type StepSpec = [key: string, kind: string, values?: Values];
type LinkSpec = [from: string, to: string, handle?: string];

/** Build a graph from a compact spec and lay it out left to right. */
function build(steps: StepSpec[], links: LinkSpec[]) {
  const ids = Object.fromEntries(steps.map(([key]) => [key, uid()]));
  const nodes: StepNode[] = steps.map(([key, kind, values]) => ({
    id: ids[key],
    type: 'step',
    position: { x: 0, y: 0 },
    data: { kind, values: { ...defOf(kind).defaults, ...values } },
  }));
  const edges: Edge[] = links.map(([from, to, handle]) => ({
    id: uid(),
    source: ids[from],
    target: ids[to],
    sourceHandle: handle ?? null,
    label: handle ? handle[0].toUpperCase() + handle.slice(1) : undefined,
  }));
  const pos = layout(toGraph(nodes), edges);
  return { nodes: nodes.map((n) => ({ ...n, position: pos[n.id] })), edges };
}

export const TEMPLATES = {
  'Interview acceptance': {
    description:
      'Ask the hiring manager to confirm, then invite the candidate and add a task to schedule it.',
    build: () =>
      build(
        [
          ['t', 'trigger.stage_entered', { stage: 'Interview' }],
          [
            'a',
            'approval.request',
            {
              approver: 'Hiring manager',
              due: '1 business days',
              note: 'Confirm this candidate should be interviewed.',
            },
          ],
          [
            'e',
            'action.send_email',
            {
              template: 'Interview invitation',
              name: 'Invite to interview',
              ...emailOf('Interview invitation'),
            },
          ],
          [
            'k',
            'action.create_task',
            {
              title: 'Schedule the interview',
              assignee: 'Recruiter',
              due: '1 days',
              priority: 'High',
            },
          ],
          [
            'n',
            'action.notify',
            {
              who: 'Recruiter',
              channel: 'In app',
              message: 'The hiring manager declined to interview {{candidate.full_name}}.',
            },
          ],
        ],
        [
          ['t', 'a'],
          ['a', 'e', 'approved'],
          ['e', 'k'],
          ['a', 'n', 'rejected'],
        ],
      ),
  },
  'Rejection follow-up': {
    description: 'Wait two days, send a kind rejection, and tag strong runners-up for future jobs.',
    build: () =>
      build(
        [
          ['t', 'trigger.candidate_rejected', { afterStage: 'Interview' }],
          ['w', 'logic.wait', { duration: '2 business days' }],
          [
            'e',
            'action.send_email',
            { template: 'Rejection after interview', ...emailOf('Rejection after interview') },
          ],
          [
            'c',
            'logic.condition',
            { field: 'Rating', operator: 'greater than', value: '3', name: 'Strong runner-up?' },
          ],
          ['g', 'action.add_tag', { tags: 'Silver medalist, Talent pool' }],
          [
            'n',
            'action.notify',
            {
              who: 'Recruiting lead',
              channel: 'Slack',
              message: '{{candidate.full_name}} was a strong runner-up for {{job.title}}.',
            },
          ],
          ['x', 'action.add_tag', { tags: 'Archived' }],
        ],
        [
          ['t', 'w'],
          ['w', 'e'],
          ['e', 'c'],
          ['c', 'g', 'yes'],
          ['g', 'n'],
          ['c', 'x', 'no'],
        ],
      ),
  },
  'Offer approval': {
    description: 'Get the hiring manager and finance to approve each offer before it goes out.',
    build: () =>
      build(
        [
          ['t', 'trigger.stage_entered', { stage: 'Offer' }],
          [
            'm',
            'approval.request',
            { approver: 'Hiring manager', name: 'Hiring manager sign-off' },
          ],
          [
            'f',
            'approval.request',
            {
              approver: 'Finance',
              due: '3 business days',
              timeout: 'Escalate to recruiting lead',
              name: 'Finance sign-off',
            },
          ],
          ['e', 'action.send_email', { template: 'Offer letter', ...emailOf('Offer letter') }],
          [
            'n',
            'action.notify',
            {
              who: 'Recruiter',
              channel: 'Email',
              message: 'The offer for {{candidate.full_name}} was not approved.',
            },
          ],
        ],
        [
          ['t', 'm'],
          ['m', 'f', 'approved'],
          ['f', 'e', 'approved'],
          ['m', 'n', 'rejected'],
          ['f', 'n', 'rejected'],
        ],
      ),
  },
  'New application triage': {
    description: 'Thank every applicant, then sort them by department.',
    build: () =>
      build(
        [
          ['t', 'trigger.application_created'],
          [
            'e',
            'action.send_email',
            { template: 'Application received', ...emailOf('Application received') },
          ],
          ['s', 'logic.split', { field: 'Department', branches: 'Engineering, Sales' }],
          [
            'c',
            'logic.condition',
            {
              field: 'Years of experience',
              operator: 'greater than',
              value: '4',
              name: 'Experienced?',
            },
          ],
          ['m', 'action.move_stage', { stage: 'Screening' }],
          ['j', 'action.add_tag', { tags: 'Junior pipeline' }],
          ['p', 'action.move_stage', { stage: 'Phone screen' }],
          [
            'r',
            'action.create_task',
            {
              title: 'Review the application by hand',
              assignee: 'Recruiter',
              due: '2 business days',
            },
          ],
        ],
        [
          ['t', 'e'],
          ['e', 's'],
          ['s', 'c', 'v:Engineering'],
          ['c', 'm', 'yes'],
          ['c', 'j', 'no'],
          ['s', 'p', 'v:Sales'],
          ['s', 'r', 'other'],
        ],
      ),
  },
  Blank: {
    description: 'Start with one step and add the rest yourself.',
    build: () => build([['t', 'trigger.stage_entered', { stage: 'Applied' }]], []),
  },
} satisfies Record<
  string,
  { description: string; build: () => { nodes: StepNode[]; edges: Edge[] } }
>;
export type TemplateName = keyof typeof TEMPLATES;

export function createWorkflow(name: string, template: TemplateName): Workflow {
  return {
    id: uid(),
    name,
    status: 'Draft',
    updatedAt: new Date().toISOString(),
    runsThisWeek: 0,
    ...TEMPLATES[template].build(),
    versions: [],
  };
}

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const seed = (
  name: string,
  template: TemplateName,
  status: WorkflowStatus,
  runs: number,
  hours: number,
): Workflow => ({
  ...createWorkflow(name, template),
  status,
  runsThisWeek: runs,
  updatedAt: ago(hours),
});

function referralFastTrack(): Workflow {
  return {
    ...seed('Referral fast track', 'Blank', 'Active', 9, 120),
    ...build(
      [
        ['t', 'trigger.application_created', { source: 'Referral' }],
        ['m', 'action.move_stage', { stage: 'Phone screen' }],
        [
          'n',
          'action.notify',
          {
            who: 'Recruiter',
            channel: 'Slack',
            message: 'New referral: {{candidate.full_name}} for {{job.title}}.',
          },
        ],
        [
          'k',
          'action.create_task',
          { title: 'Thank the referrer', assignee: 'Recruiter', due: '2 days', priority: 'Low' },
        ],
      ],
      [
        ['t', 'm'],
        ['m', 'n'],
        ['n', 'k'],
      ],
    ),
  };
}

const SEED: Workflow[] = [
  seed('Interview acceptance', 'Interview acceptance', 'Active', 42, 3),
  seed('Rejection follow-up', 'Rejection follow-up', 'Active', 118, 26),
  seed('Offer approval', 'Offer approval', 'Paused', 3, 72),
  seed('New application triage', 'New application triage', 'Draft', 0, 0.5),
  referralFastTrack(),
];

export type SampleCandidate = { id: string; name: string; values: Values };
export const SAMPLE_CANDIDATES: SampleCandidate[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    values: {
      Stage: 'Interview',
      Source: 'Referral',
      Rating: '4',
      Location: 'Austin, TX',
      Department: 'Engineering',
      Tags: 'Senior, Remote OK',
      'Years of experience': '7',
    },
  },
  {
    id: 'jordan',
    name: 'Jordan Ellis',
    values: {
      Stage: 'Screening',
      Source: 'LinkedIn',
      Rating: '2',
      Location: 'London',
      Department: 'Sales',
      Tags: 'Silver medalist',
      'Years of experience': '3',
    },
  },
  {
    id: 'priya',
    name: 'Priya Raman',
    values: {
      Stage: 'Applied',
      Source: 'Careers page',
      Rating: '3',
      Location: 'Remote',
      Department: 'Design',
      Tags: '',
      'Years of experience': '5',
    },
  },
];

/**
 * All workflows in this browser. `ready` turns true on the render after the stored copy is read
 * (this effect runs after useLocalStorageState's load effect, and both updates land together).
 */
export function useWorkflows() {
  const [stored, setStored] = useLocalStorageState<Workflow[] | null>(
    'ats-preview:workflows',
    null,
  );
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const workflows = stored ?? SEED;
  const update = (fn: (all: Workflow[]) => Workflow[]) => setStored((s) => fn(s ?? SEED));
  return { workflows, ready, update };
}
