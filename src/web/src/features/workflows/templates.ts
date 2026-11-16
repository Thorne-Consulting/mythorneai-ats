import { defOf } from './catalog';
import type { Graph, Values } from './workflow-api';

// Starting points in the "Create workflow" gallery. Steps and links are written compactly and
// laid out by the editor when it opens.

type StepSpec = [key: string, kind: string, values?: Values];
type LinkSpec = [from: string, to: string, handle?: string];

export const uid = () => Math.random().toString(36).slice(2, 10);

function build(steps: StepSpec[], links: LinkSpec[]): Graph {
  const ids = Object.fromEntries(steps.map(([key]) => [key, uid()]));
  return {
    nodes: steps.map(([key, kind, values]) => ({
      id: ids[key],
      kind,
      values: { ...defOf(kind).defaults, ...values },
    })),
    edges: links.map(([from, to, handle]) => ({
      id: uid(),
      source: ids[from],
      target: ids[to],
      sourceHandle: handle ?? null,
    })),
  };
}

export type Template = {
  id: string;
  name: string;
  description: string;
  /** The kinds shown as icons on the card, in order. */
  preview: string[];
  build: () => Graph;
};

export const TEMPLATES: Template[] = [
  {
    id: 'follow-up',
    name: 'Follow up until they reply',
    description:
      'Email the candidate, wait three days, and nudge them once if they have not answered.',
    preview: [
      'trigger.stage_entered',
      'action.send_email',
      'logic.wait',
      'logic.condition',
      'action.send_email',
    ],
    build: () =>
      build(
        [
          ['t', 'trigger.stage_entered', { stage: 'type:Interview' }],
          [
            'e',
            'action.send_email',
            {
              subject: 'Next steps for {{jobTitle}}',
              body: 'Hi {{firstName}},\n\nThanks for your interest in {{jobTitle}}. Could you reply with a few times that work for a call next week?\n\n{{recruiterName}}',
            },
          ],
          ['w', 'logic.wait', { duration: '3 business days', window: 'business' }],
          [
            'c',
            'logic.condition',
            { field: 'replied', operator: 'is', value: 'yes', name: 'Did they reply?' },
          ],
          [
            'f',
            'action.send_email',
            {
              name: 'Send a reminder',
              subject: 'Following up: {{jobTitle}}',
              body: 'Hi {{firstName}},\n\nJust checking you saw my last email. Reply with a few times that work, and we will set up the call.\n\n{{recruiterName}}',
            },
          ],
          [
            'n',
            'action.notify',
            { message: '{{candidateName}} has not replied about {{jobTitle}} after two emails.' },
          ],
        ],
        [
          ['t', 'e'],
          ['e', 'w'],
          ['w', 'c'],
          ['c', 'f', 'no'],
          ['f', 'n'],
        ],
      ),
  },
  {
    id: 'rejection',
    name: 'Keep strong runners-up',
    description: 'When someone is rejected after a good rating, tag them and tell the recruiter.',
    preview: ['trigger.candidate_rejected', 'logic.condition', 'action.add_tag', 'action.notify'],
    build: () =>
      build(
        [
          ['t', 'trigger.candidate_rejected'],
          [
            'c',
            'logic.condition',
            { field: 'rating', operator: 'greater than', value: '3', name: 'Strong runner-up?' },
          ],
          ['g', 'action.add_tag', { tags: 'Silver medalist' }],
          [
            'n',
            'action.notify',
            {
              message:
                '{{candidateName}} was a strong runner-up for {{jobTitle}}. They are tagged Silver medalist.',
            },
          ],
        ],
        [
          ['t', 'c'],
          ['c', 'g', 'yes'],
          ['g', 'n'],
        ],
      ),
  },
  {
    id: 'referrals',
    name: 'Fast-track referrals',
    description: 'Move referred applicants straight to review and let the recruiter know.',
    preview: [
      'trigger.application_created',
      'action.move_stage',
      'action.add_tag',
      'action.notify',
    ],
    build: () =>
      build(
        [
          ['t', 'trigger.application_created', { source: 'Referral' }],
          ['m', 'action.move_stage', { stage: 'type:Screen' }],
          ['g', 'action.add_tag', { tags: 'Referral' }],
          ['n', 'action.notify', { message: 'New referral: {{candidateName}} for {{jobTitle}}.' }],
        ],
        [
          ['t', 'm'],
          ['m', 'g'],
          ['g', 'n'],
        ],
      ),
  },
  {
    id: 'stuck',
    name: 'Nudge the team about stuck candidates',
    description: 'When an application has had no activity for a week, alert the hiring manager.',
    preview: ['trigger.stuck', 'action.notify'],
    build: () =>
      build(
        [
          ['t', 'trigger.stuck', { days: '7' }],
          [
            'n',
            'action.notify',
            {
              who: 'hiringManager',
              message:
                '{{candidateName}} has been in {{stageName}} for {{daysWaiting}} days with no activity.',
            },
          ],
        ],
        [['t', 'n']],
      ),
  },
  {
    id: 'interview-done',
    name: 'Thank candidates after an interview',
    description: 'A day after an interview is marked done, send a short thank-you.',
    preview: ['trigger.interview_completed', 'logic.wait', 'action.send_email'],
    build: () =>
      build(
        [
          ['t', 'trigger.interview_completed'],
          ['w', 'logic.wait', { duration: '1 days', window: 'business' }],
          [
            'e',
            'action.send_email',
            {
              subject: 'Thank you for your time',
              body: 'Hi {{firstName}},\n\nThank you for talking with us about {{jobTitle}}. We will be in touch soon with next steps.\n\n{{company}} hiring team',
            },
          ],
        ],
        [
          ['t', 'w'],
          ['w', 'e'],
        ],
      ),
  },
  {
    id: 'interview-eve',
    name: 'Remind candidates the day before',
    description: 'When an interview is booked, wait until a day before it, then send a reminder.',
    preview: ['trigger.interview_scheduled', 'logic.wait', 'action.send_email'],
    build: () =>
      build(
        [
          ['t', 'trigger.interview_scheduled'],
          [
            'w',
            'logic.wait',
            { mode: 'date', date: 'interview', offset: '1 days', direction: 'before' },
          ],
          [
            'e',
            'action.send_email',
            {
              subject: 'See you tomorrow: {{interviewTitle}}',
              body: 'Hi {{firstName}},\n\nA quick reminder that your interview for {{jobTitle}} is tomorrow. You can see the details in your portal: {{portalLink}}\n\n{{company}} hiring team',
            },
          ],
        ],
        [
          ['t', 'w'],
          ['w', 'e'],
        ],
      ),
  },
  {
    id: 'blank',
    name: 'Start from scratch',
    description: 'Pick what starts it, then add each step yourself.',
    preview: [],
    build: () => ({ nodes: [], edges: [] }),
  },
];
