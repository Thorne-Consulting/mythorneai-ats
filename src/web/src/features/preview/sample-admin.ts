// Sample data for the admin preview screens (workflows, single sign-on, access requests,
// invitations, team access). Every person and address is fictional (names from the Figma frames).
// Replace each block with a query when its backend exists.
import { CalendarCheck, CheckCircle2, GitBranch, Mail, type LucideIcon } from 'lucide-react';

export const workspaceRoles = ['Admin', 'Recruiter', 'Hiring manager', 'Interviewer'];

// ── Automated workflows ──────────────────────────────────────────────────────

export type StageField = {
  key: string;
  label: string;
  options: string[];
  /** Shown on the node card. */ meta?: boolean;
};

export type WorkflowStage = {
  id: string;
  kind: 'Trigger' | 'Condition' | 'Approval' | 'Action';
  icon: LucideIcon;
  title: string;
  description: string;
  fields: StageField[];
  values: Record<string, string>;
};

// ── Single sign-on ───────────────────────────────────────────────────────────

export const sampleSso = {
  provider: 'okta',
  domain: 'example.com',
  metadataUrl: 'https://example.okta.com/app/exk1a2b3c4/sso/saml/metadata',
  requireSso: false,
  scim: true,
  scimToken: 'scim_sample_9f3c2a7e1b5d4c8a',
  scimBaseUrl: 'https://ats.example.com/scim/v2',
};

export const sampleSsoStats = { members: 48, onSso: 44, scimUsers: 46, lastSync: '12 minutes ago' };

// ── Access requests and invitations ──────────────────────────────────────────

export type AccessRequest = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  requested: string;
  note: string;
};

export const sampleAccessRequests: AccessRequest[] = [
  {
    id: 'q1',
    name: 'Maegan Maghanoy',
    email: 'maegan@example.com',
    role: 'Recruiter',
    team: 'Product Hiring',
    requested: 'Today, 09:14',
    note: 'Joining the product hiring squad.',
  },
  {
    id: 'q2',
    name: 'Josebel Libre',
    email: 'josebel@example.com',
    role: 'Hiring manager',
    team: 'Engineering',
    requested: 'Yesterday',
    note: 'Needs to review backend candidates.',
  },
  {
    id: 'q3',
    name: 'Kylie Toledo',
    email: 'kylie@example.com',
    role: 'Interviewer',
    team: 'Product Hiring',
    requested: 'Nov 8',
    note: 'Panel interviewer for design roles.',
  },
];

export type Invitation = {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  sent: string;
  status: 'Pending' | 'Expired';
};

export const sampleInvitations: Invitation[] = [
  {
    id: 'i1',
    email: 'pragya@example.com',
    role: 'Interviewer',
    invitedBy: 'Diane Libre',
    sent: 'Today, 08:30',
    status: 'Pending',
  },
  {
    id: 'i2',
    email: 'jaylou@example.com',
    role: 'Hiring manager',
    invitedBy: 'Jerick Dayoha',
    sent: 'Nov 11',
    status: 'Pending',
  },
  {
    id: 'i3',
    email: 'third.villamor@example.com',
    role: 'Recruiter',
    invitedBy: 'Diane Libre',
    sent: 'Nov 10',
    status: 'Pending',
  },
  {
    id: 'i4',
    email: 'kleish@example.com',
    role: 'Interviewer',
    invitedBy: 'Jerick Dayoha',
    sent: 'Nov 6',
    status: 'Pending',
  },
  {
    id: 'i5',
    email: 'andrea.santos@example.com',
    role: 'Interviewer',
    invitedBy: 'Jerick Dayoha',
    sent: 'Oct 28',
    status: 'Expired',
  },
  {
    id: 'i6',
    email: 'paolo.mendoza@example.com',
    role: 'Hiring manager',
    invitedBy: 'Diane Libre',
    sent: 'Oct 21',
    status: 'Expired',
  },
];

// ── Team access ──────────────────────────────────────────────────────────────

export type JobAccess = { view: boolean; pipeline: boolean; offers: boolean };

export const sampleJobs = [
  { id: 'j1', title: 'Software Engineer', department: 'Engineering', code: 'JOB-024' },
  { id: 'j2', title: 'Backend Engineer', department: 'Engineering', code: 'JOB-027' },
  { id: 'j3', title: 'Product Designer', department: 'Design', code: 'JOB-019' },
  { id: 'j4', title: 'Data Analyst', department: 'Analytics', code: 'JOB-031' },
  { id: 'j5', title: 'Marketing Specialist', department: 'Marketing', code: 'JOB-022' },
];

export type Team = {
  id: string;
  name: string;
  description: string;
  members: string[];
  access: Record<string, JobAccess>;
};

const all = (view: boolean, pipeline: boolean, offers: boolean): JobAccess => ({
  view,
  pipeline,
  offers,
});

export const sampleTeams: Team[] = [
  {
    id: 't1',
    name: 'People Operations',
    description: 'Owns hiring policy and offers',
    members: ['Diane Libre', 'Jerick Dayoha', 'Josebel Libre'],
    access: Object.fromEntries(sampleJobs.map((j) => [j.id, all(true, true, true)])),
  },
  {
    id: 't2',
    name: 'Engineering',
    description: 'Interviews engineering candidates',
    members: [
      'Jaylou Mae Recomo',
      'Pragya Sharma',
      'Carl Rabanero',
      'Third Villamor',
      'Nicole Reyes',
    ],
    access: {
      j1: all(true, true, false),
      j2: all(true, true, false),
      j3: all(false, false, false),
      j4: all(true, false, false),
      j5: all(false, false, false),
    },
  },
  {
    id: 't3',
    name: 'Product Hiring',
    description: 'Design, product and analytics roles',
    members: ['Maegan Maghanoy', 'Kylie Toledo', 'Kleish Mendiola', 'Sofia Ramos'],
    access: {
      j1: all(false, false, false),
      j2: all(false, false, false),
      j3: all(true, true, false),
      j4: all(true, true, false),
      j5: all(true, false, false),
    },
  },
];
