'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';

// The workflow API (src/server/Features/Workflows). Graph values are text; their formats are
// described in WorkflowGraph.cs and catalog.tsx.

export type Values = Record<string, string>;
export type GraphNode = {
  id: string;
  kind: string;
  values: Values;
  position?: { x: number; y: number } | null;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type Problem = { message: string; nodeIds: string[] };

export type WorkflowStatus = 'Draft' | 'Active' | 'Paused' | 'Archived';
export type RunStatus = 'Running' | 'Waiting' | 'Completed' | 'Failed' | 'Cancelled';

export type WorkflowRow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  builtInKey: string | null;
  trigger: GraphNode | null;
  steps: number;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  runs30: number;
  failed: number;
  inProgress: number;
  owner: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type WorkflowDetail = {
  id: string;
  name: string;
  status: WorkflowStatus;
  builtInKey: string | null;
  draft: Graph;
  publishedVersion: { id: string; number: number; publishedAt: string; publishedBy: string } | null;
  hasUnpublishedChanges: boolean;
  runsOncePerApplication: boolean;
  maxRunsPerApplication: number | null;
  stopWhenClosed: boolean;
  respectQuietHours: boolean;
  updatedAt: string;
  updatedBy: string | null;
  problems: Problem[];
  runs: { inProgress: number; failed: number; total: number };
};

export type Version = {
  id: string;
  number: number;
  publishedAt: string;
  publishedBy: string;
  note: string | null;
  summary: string;
  isCurrent: boolean;
  steps: number;
};

export type RunRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  nextRunAt: string | null;
  currentStep: string | null;
  lastError: string | null;
  attempts: number;
  versionNumber: number;
};

export type RunDetail = Omit<RunRow, 'currentStep'> & {
  workflowId: string;
  workflowName: string;
  triggerKind: string;
  currentNodeId: string | null;
  steps: {
    id: string;
    nodeId: string;
    kind: string;
    title: string;
    status: 'Done' | 'Skipped' | 'Waiting' | 'Failed';
    branch: string | null;
    output: string | null;
    error: string | null;
    attempts: number;
    startedAt: string;
    finishedAt: string | null;
    emails?: {
      id: string;
      recipient: string;
      subject: string;
      status: string | null;
      error: string | null;
    }[];
    webhook?: { status: string; lastStatusCode: number | null; lastError: string | null } | null;
  }[];
};

export type DryStep = {
  nodeId: string;
  kind: string;
  title: string;
  status: 'Done' | 'Skipped' | 'Waiting' | 'Failed';
  branch: string | null;
  output: string;
  detail?: { emails?: { id: string; recipient: string; subject: string; body: string }[] } | null;
};

export type Lookups = {
  jobs: { id: string; title: string; code: string; department: string; status: string }[];
  departments: string[];
  stageTypes: string[];
  stages: { name: string; jobs: number; type: string }[];
  reasons: string[];
  sources: string[];
  tags: string[];
  people: { email: string; name: string; role: string }[];
  templates: { key: string; label: string; variables: string[] }[];
  variables: { key: string; label: string }[];
  webhooks: { id: string; url: string; isActive: boolean }[];
  assessments: { id: string; name: string; published?: boolean }[];
  /** Dates a wait can be set against: the interview, offer dates, custom date fields. */
  dates?: { value: string; label: string }[];
  fields: { value: string; label: string; type: 'text' | 'number'; options: string[] | null }[];
  teamChannel: boolean;
  quietHours: { start: number; end: number; timeZone: string } | null;
};

export type Reminder = {
  key: string;
  workflowId: string | null;
  name: string;
  description: string;
  enabled: boolean;
  /** Null when each assessment sets its own day count. */
  days: number | null;
  maxReminders: number;
  runs30: number;
};

export const workflowKeys = {
  list: ['workflows'] as const,
  one: (id: string) => ['workflows', id] as const,
  versions: (id: string) => ['workflows', id, 'versions'] as const,
  runs: (id: string, status: string | null) => ['workflows', id, 'runs', status] as const,
  run: (id: string) => ['workflow-runs', id] as const,
  lookups: ['workflows', 'lookups'] as const,
  reminders: ['workflows', 'reminders'] as const,
};

export const useWorkflowList = () =>
  useQuery({
    queryKey: workflowKeys.list,
    queryFn: () => api.get<WorkflowRow[]>('/api/workflows'),
  });

export const useWorkflow = (id: string) =>
  useQuery({
    queryKey: workflowKeys.one(id),
    queryFn: () => api.get<WorkflowDetail>(`/api/workflows/${id}`),
    // The editor holds the draft; refetching on focus would fight the person typing.
    refetchOnWindowFocus: false,
  });

export const useLookups = () =>
  useQuery({
    queryKey: workflowKeys.lookups,
    queryFn: () => api.get<Lookups>('/api/workflows/lookups'),
    staleTime: 60_000,
  });

export const statusTone = {
  Draft: 'gray',
  Active: 'green',
  Paused: 'amber',
  Archived: 'gray',
} as const;

export const runTone = {
  Running: 'blue',
  Waiting: 'violet',
  Completed: 'green',
  Failed: 'red',
  Cancelled: 'gray',
} as const;

export const runLabel: Record<RunStatus, string> = {
  Running: 'Running',
  Waiting: 'Waiting',
  Completed: 'Finished',
  Failed: 'Failed',
  Cancelled: 'Stopped',
};
