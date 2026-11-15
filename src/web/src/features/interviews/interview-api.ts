'use client';

import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import type { Interview } from '@/features/applications/application-types';

/** One interviewer on a calendar row. */
export type RowInterviewer = { email: string; name: string; submitted: boolean };

/** A row from GET /api/interviews: every status, with names. */
export type CalendarInterview = {
  id: string;
  applicationId: string;
  candidateId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: string;
  meetingLink?: string | null;
  kitName?: string | null;
  calendarStatus: string;
  candidateName: string;
  requisitionId: string;
  requisitionTitle: string;
  interviewerEmails: string[];
  interviewers: RowInterviewer[];
  cancelReason?: string | null;
  noShowParty?: string | null;
  attendeeResponsesJson?: string | null;
};

export type InterviewDetail = Interview & {
  applicationId: string;
  meetingType?: string | null;
  location?: string | null;
  loopId?: string | null;
  schedulingRequestId?: string | null;
  /** {"email":"accepted"|"declined"|"tentative"|"needsAction"} from the calendar invite. */
  attendeeResponsesJson?: string | null;
  calendarError?: string | null;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  outcomeAt?: string | null;
  outcomeBy?: string | null;
  noShowParty?: string | null;
  outcomeNote?: string | null;
  notesVisible: boolean;
  submittedEmails: string[];
};

export type InterviewRecordData = {
  interview: InterviewDetail;
  candidate: { id: string; name: string; title?: string | null; timeZone?: string | null };
  job: { id: string; title: string; code: string };
  stage: string;
  canManage: boolean;
  /** Interviews on this application where you still owe a scorecard. */
  blindedBy: string[];
  people: Record<string, { name: string; timeZone?: string | null; role: string }>;
  activity: { action: string; actorEmail: string; occurredAt: string }[];
  organizationTimeZone: string;
  interviewKits: { id: string; name: string; durationMinutes: number }[] | null;
};

export type OpenLink = {
  id: string;
  applicationId: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  reminderCount: number;
  candidateName: string;
  requisitionTitle: string;
  url: string;
};

export type AttentionData = {
  needsOutcome: CalendarInterview[];
  calendarProblems: CalendarInterview[];
  /** Older "proposed" times still waiting on the candidate. */
  waitingForCandidate: CalendarInterview[];
  openLinks: OpenLink[];
  /** Upcoming interviews someone declined on the calendar invite. */
  declined: CalendarInterview[];
};

/** What each person answered on the calendar invite, by email. */
export function responsesOf(json?: string | null): Record<string, string> {
  try {
    return json ? (JSON.parse(json) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  timeZone?: string | null;
  calendarConnected: boolean;
  interviewsThisWeek: number;
  maxInterviewsPerWeek?: number | null;
};

const noSubscribe = () => () => {};

/**
 * False while the server renders and during hydration, true after. Times are written in the
 * reader's own zone, which the server does not know, so they wait for this.
 */
export const useInBrowser = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

export const interviewHref = (id: string, tab?: 'room' | 'recording' | 'summary' | 'feedback') =>
  `/interviews/${id}${tab ? `/${tab}` : ''}`;

export function useInterview(id: string, initialData?: InterviewRecordData) {
  return useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.get<InterviewRecordData>(`/api/interviews/${id}`),
    initialData,
  });
}

export function useCalendarRange(
  from: Date,
  to: Date,
  options: { mine?: boolean; enabled?: boolean } = {},
) {
  const valid = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from;
  return useQuery({
    queryKey: [
      'interview-calendar',
      valid ? from.toISOString() : '',
      valid ? to.toISOString() : '',
      !!options.mine,
    ],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${options.mine ? '&mine=true' : ''}`,
      ),
    enabled: valid && options.enabled !== false,
  });
}

export function usePeople(enabled = true) {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<Person[]>('/api/people'),
    enabled,
    staleTime: 60_000,
  });
}

/** Refresh everything that shows this interview. */
export function useRefreshInterview() {
  const queryClient = useQueryClient();
  return (id: string, applicationId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['interview', id] });
    queryClient.invalidateQueries({ queryKey: ['interview-calendar'] });
    queryClient.invalidateQueries({ queryKey: ['interview-attention'] });
    if (applicationId) queryClient.invalidateQueries({ queryKey: ['application', applicationId] });
  };
}

export type CancelInput = { reason: string; messageToCandidate?: string; notifyCandidate: boolean };
export type OutcomeInput = {
  outcome: 'Completed' | 'NoShow';
  noShowParty?: 'Candidate' | 'Interviewer';
  note?: string;
  notifyCandidate?: boolean;
};

export function useInterviewActions(id: string, applicationId?: string) {
  const refresh = useRefreshInterview();
  const done = (message: string) => () => {
    refresh(id, applicationId);
    toast.success(message);
  };
  const cancel = useMutation({
    mutationFn: (input: CancelInput) => api.post(`/api/interviews/${id}/cancel`, input),
    onSuccess: done('Interview cancelled'),
    onError: (error: Error) => toast.error('Could not cancel the interview', error.message),
  });
  const outcome = useMutation({
    mutationFn: (input: OutcomeInput) => api.post(`/api/interviews/${id}/outcome`, input),
    onSuccess: (_result, input) =>
      done(input.outcome === 'NoShow' ? 'Marked as a no-show' : 'Marked as completed')(),
    onError: (error: Error) => toast.error('Could not save how it went', error.message),
  });
  return { cancel, outcome };
}

/** A recording as the interview page shows it. Transcript fields are empty while you are blinded. */
export type RecordingInfo = {
  id: string;
  originalFileName: string;
  contentType: string;
  length: number;
  uploadedBy: string;
  recordedAt: string;
  status: 'Uploading' | 'Processing' | 'Ready' | 'Failed';
  /** Transcript: a transcript file imported from another tool, with no recording to play. */
  source: 'Browser' | 'Upload' | 'Transcript';
  durationSeconds?: number | null;
  processingError?: string | null;
  transcriptStatus?: 'None' | 'Queued' | 'Running' | 'Ready' | 'Failed' | 'TooLong' | null;
  transcriptError?: string | null;
};

export const recordingsOf = (interview: InterviewDetail) =>
  interview.recordings as unknown as RecordingInfo[];

export type TranscriptSegment = {
  start: number;
  end: number;
  speaker?: string | null;
  text: string;
};
