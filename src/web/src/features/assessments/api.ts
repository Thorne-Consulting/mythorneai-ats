'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { Content, IntegrityEvent, Question, Section } from './scoring';

export type AssessmentKind = 'Native' | 'External';
export type AssessmentStatus = 'Draft' | 'Active' | 'Archived';
export type InviteStatus = 'NotStarted' | 'InProgress' | 'Submitted' | 'Expired' | 'Revoked';
export type Decision = 'Passed' | 'Failed';

/** One row of GET /api/assessments. Counts cover the applications you can see. */
export type LibraryRow = {
  id: string;
  name: string;
  department: string | null;
  kind: AssessmentKind;
  status: AssessmentStatus;
  providerName: string | null;
  expiryDays: number;
  questions: number;
  points: number;
  minutes: number;
  timed: boolean;
  passMark: number;
  invited: number;
  completed: number;
  toReview: number;
  open: number;
  passRate: number | null;
  lastActivityAt: string;
  updatedAt: string;
};

/** The editable fields (PUT /api/assessments/{id} replaces all of them). */
export type AssessmentForm = {
  name: string;
  department: string | null;
  kind: AssessmentKind;
  expiryDays: number;
  /** Null turns the automatic reminder off. */
  remindAfterDays: number | null;
  blindReview: boolean;
  providerName: string | null;
  externalUrl: string | null;
  content: Content;
};

export type AssessmentDetail = AssessmentForm & {
  id: string;
  status: AssessmentStatus;
  updatedAt: string;
  /** What candidates get today; null until the first publish. */
  published: Content | null;
  version: { number: number; publishedAt: string; publishedBy: string } | null;
  hasUnpublishedChanges: boolean;
  problems: string[];
  counts: {
    notStarted: number;
    inProgress: number;
    submitted: number;
    expired: number;
    toReview: number;
    passed: number;
    failed: number;
  };
  olderVersionResults: number;
  canEdit: boolean;
};

export type InviteRow = {
  id: string;
  assessmentId: string;
  assessmentName: string;
  kind: AssessmentKind;
  /** Blind review and no decision yet: show `blindName`, not the person. */
  blind: boolean;
  applicationId: string;
  candidateId: string;
  candidate: string;
  email: string;
  job: string;
  status: InviteStatus;
  attempt: number;
  replaced: boolean;
  invitedAt: string;
  expiresAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  extraMinutes: number;
  earned: number;
  max: number;
  pending: number;
  percent: number | null;
  decision: Decision | null;
  decidedBy: string | null;
  passMark: number;
  reminderCount: number;
  lastReminderAt: string | null;
  versionNumber: number;
  flags: number;
  /** Remind, change the deadline, retake and revoke: for people who manage the job. */
  canManage: boolean;
};

export type Analysis = {
  versionNumber: number | null;
  passMark?: number;
  total?: number;
  percents: number[];
  questions: {
    id: string;
    number: number;
    type: Question['type'];
    prompt: string;
    points: number;
    answered: number;
    averagePoints: number | null;
    correctRate: number | null;
    topHalfRate: number | null;
  }[];
};

export type FileRef = { id: string; name: string; length: number; contentType?: string };

export type ReviewAnswer = {
  questionId: string;
  choiceIds: string[];
  text: string | null;
  file: FileRef | null;
  seconds: number;
  savedAt: string;
  autoPoints: number | null;
  reviewerPoints: number | null;
  reviewer: string | null;
  reviewerNote: string | null;
};

export type Review = {
  id: string;
  assessment: {
    id: string;
    name: string;
    kind: AssessmentKind;
    providerName: string | null;
    passMark: number;
    blindReview: boolean;
  };
  versionNumber: number;
  blind: boolean;
  candidate: { id: string; name: string; email: string } | null;
  blindName: string;
  applicationId: string | null;
  job: { id: string; title: string };
  status: InviteStatus;
  attempt: number;
  invitedAt: string;
  expiresAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  extraMinutes: number;
  minutes: number;
  timed: boolean;
  earned: number;
  max: number;
  pending: number;
  percent: number | null;
  decision: Decision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
  sections: Section[];
  answers: ReviewAnswer[];
  integrity: IntegrityEvent[];
  report: FileRef | null;
  canGrade: boolean;
  canRecordResult: boolean;
  canReopen: boolean;
  canManage: boolean;
  history: {
    id: number;
    action: string;
    actorEmail: string;
    occurredAt: string;
    details: string | null;
  }[];
  attempts: { id: string; attempt: number; status: InviteStatus; percent: number | null }[];
  next: { id: string; assessmentId: string } | null;
};

export const assessmentKeys = {
  all: ['assessments'] as const,
  library: ['assessments', 'library'] as const,
  options: ['assessments', 'options'] as const,
  detail: (id: string) => ['assessments', 'detail', id] as const,
  invites: (id: string) => ['assessments', 'invites', id] as const,
  analysis: (id: string) => ['assessments', 'analysis', id] as const,
  toReview: ['assessments', 'to-review'] as const,
  review: (id: string) => ['assessments', 'review', id] as const,
  application: (id: string) => ['assessments', 'application', id] as const,
};

export const useLibrary = () =>
  useQuery({
    queryKey: assessmentKeys.library,
    queryFn: () => api.get<LibraryRow[]>('/api/assessments'),
  });

export const useToReview = () =>
  useQuery({
    queryKey: assessmentKeys.toReview,
    queryFn: () => api.get<InviteRow[]>('/api/assessment-invites/to-review'),
  });

export const useDepartments = () =>
  useQuery({
    queryKey: assessmentKeys.options,
    queryFn: () => api.get<{ departments: string[] }>('/api/assessments/options'),
    staleTime: 5 * 60_000,
  });

export const useAssessment = (id: string | undefined) =>
  useQuery({
    queryKey: assessmentKeys.detail(id ?? ''),
    queryFn: () => api.get<AssessmentDetail>(`/api/assessments/${id}`),
    enabled: !!id,
  });

export const useInvites = (id: string) =>
  useQuery({
    queryKey: assessmentKeys.invites(id),
    queryFn: () => api.get<InviteRow[]>(`/api/assessments/${id}/invites`),
  });

export const useAnalysis = (id: string) =>
  useQuery({
    queryKey: assessmentKeys.analysis(id),
    queryFn: () => api.get<Analysis>(`/api/assessments/${id}/analysis`),
  });

export const useReview = (id: string) =>
  useQuery({
    queryKey: assessmentKeys.review(id),
    queryFn: () => api.get<Review>(`/api/assessment-invites/${id}`),
  });

export const useApplicationAssessments = (applicationId: string, enabled = true) =>
  useQuery({
    queryKey: assessmentKeys.application(applicationId),
    queryFn: () =>
      api.get<{ canManage: boolean; active: boolean; invites: InviteRow[] }>(
        `/api/applications/${applicationId}/assessments`,
      ),
    enabled,
  });

/** Refetch everything assessment-shaped after a change: lists, counts, cards. */
export function useRefreshAssessments() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: assessmentKeys.all });
}

/** Form fields from a detail response (for the builder). */
export const formOf = (a: AssessmentDetail): AssessmentForm => ({
  name: a.name,
  department: a.department,
  kind: a.kind,
  expiryDays: a.expiryDays,
  remindAfterDays: a.remindAfterDays,
  blindReview: a.blindReview,
  providerName: a.providerName,
  externalUrl: a.externalUrl,
  content: a.content,
});

export const resultHref = (assessmentId: string, inviteId: string) =>
  `/assessments/${assessmentId}/results/${inviteId}`;

/** Who to show on a row: the person, or a code while review is blind. */
export const displayName = (row: Pick<InviteRow, 'blind' | 'candidate' | 'id'>) =>
  row.blind ? `Candidate ${row.id.replaceAll('-', '').slice(0, 4).toUpperCase()}` : row.candidate;
