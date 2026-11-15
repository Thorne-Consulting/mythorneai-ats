import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';

export type ApprovalMode = 'Sequential' | 'Parallel' | 'AnyOne';
export type RoundOutcome = 'Pending' | 'Approved' | 'Rejected' | 'Stopped';

export interface ApprovalView {
  id: string;
  approverEmail: string;
  approverName: string;
  sequence: number;
  decision: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  comment?: string | null;
  decidedAt?: string | null;
  canDecide: boolean;
  /** Their turn now: a reminder or a new approver makes sense. */
  waiting?: boolean;
  round?: number;
  anyOne?: boolean;
  /** The organization's chain named this person; only an admin or they can hand it on. */
  fromPolicy?: boolean;
  reassignedFromName?: string | null;
  reassignedByName?: string | null;
  lastRemindedAt?: string | null;
}

export interface PreviousRound {
  round: number;
  outcome: RoundOutcome;
  createdAt: string;
  note?: string | null;
  requestedByName?: string;
  approvals: ApprovalView[];
}

export type JobSubject = {
  title: string;
  code: string;
  department: string;
  location: string;
  workMode: string;
  employmentType: string;
  openings: number;
  targetStartDate?: string | null;
  hiringManager?: string | null;
  salary?: string | null;
  summary: string;
};

export type OfferSubject = {
  candidateName: string;
  currentTitle?: string | null;
  jobTitle: string;
  jobCode: string;
  stage?: string | null;
  appliedAt: string;
  terms: string[];
  note: string;
  scorecards: { yes: number; no: number; total: number };
};

/** One request in a list: waiting on me, asked by me, or answered by me. */
export interface ApprovalItem {
  id: string;
  /** WorkflowRun: a workflow's "Ask for approval" step; its subject reads like an offer's (a candidate). */
  type: 'Offer' | 'Requisition' | 'WorkflowRun';
  subjectId: string;
  title: string;
  detail: string;
  note: string;
  applicationId: string | null;
  requisitionId: string | null;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
  waitingSince: string;
  decision: ApprovalView['decision'];
  decidedAt?: string | null;
  comment?: string | null;
  status: RoundOutcome;
  subjectStatus: string;
  round: number;
  mode: ApprovalMode;
  approved: number;
  total: number;
  canDecide: boolean;
  approvers: ApprovalView[];
  previousRounds: PreviousRound[];
  subject: JobSubject | OfferSubject;
}

/** Kept for older callers; the same item as the lists return. */
export type PendingApproval = ApprovalItem;

export type ApprovalScope = 'waiting' | 'requested' | 'done';

export function useApprovals(scope: ApprovalScope) {
  return useQuery({
    queryKey: ['approvals', scope],
    queryFn: () => api.get<ApprovalItem[]>(`/api/approvals?scope=${scope}`),
    refetchInterval: scope === 'waiting' ? 60_000 : undefined,
  });
}

// Approvals waiting on the signed-in user. Also drives the badge in the sidebar.
export function usePendingApprovals() {
  return useApprovals('waiting');
}

export type DirectoryUser = { email: string; displayName: string; role: string };

export function useDirectoryUsers() {
  return useQuery({
    queryKey: ['directory-users'],
    queryFn: () => api.get<DirectoryUser[]>('/api/directory/users'),
  });
}

/** People who can approve: admins, recruiters and hiring managers. */
export function useApproverOptions(exclude: string[] = []) {
  const directory = useDirectoryUsers();
  return (directory.data ?? [])
    .filter((person) => ['Admin', 'Recruiter', 'HiringManager'].includes(person.role))
    .filter((person) => !exclude.includes(person.email))
    .map((person) => ({ value: person.email, label: person.displayName }));
}

// A decision can change the approvals list, the offer, the job and the sidebar badge.
export function useInvalidateApprovals() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      'approvals',
      'offer',
      'requisition-approval',
      'requisition',
      'requisitions',
      'application',
      'dashboard',
    ])
      queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function useDecideApproval(onDone?: () => void) {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (input: { id: string; decision: 'Approved' | 'Rejected'; comment: string }) =>
      api.post<{ message: string }>(`/api/approvals/${input.id}/decide`, {
        decision: input.decision,
        comment: input.comment.trim() || null,
      }),
    onSuccess: ({ message }) => {
      invalidate();
      toast.success(message);
      onDone?.();
    },
    onError: (error: Error) => toast.error('Could not save your decision', error.message),
  });
}

export function useRemindApprover() {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/approvals/${id}/remind`),
    onSuccess: () => {
      invalidate();
      toast.success('Reminder sent');
    },
    onError: (error: Error) => toast.error('Could not send the reminder', error.message),
  });
}

export function useReassignApprover(onDone?: () => void) {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (input: { id: string; approverEmail: string }) =>
      api.post(`/api/approvals/${input.id}/reassign`, { approverEmail: input.approverEmail }),
    onSuccess: () => {
      invalidate();
      toast.success('Approver replaced', 'We asked the new approver.');
      onDone?.();
    },
    onError: (error: Error) => toast.error('Could not replace the approver', error.message),
  });
}

export function useWithdrawApproval(onDone?: () => void) {
  const invalidate = useInvalidateApprovals();
  return useMutation({
    mutationFn: (input: { subjectType: ApprovalItem['type']; subjectId: string }) =>
      api.post('/api/approvals/withdraw', input),
    onSuccess: () => {
      invalidate();
      toast.success('Request withdrawn', 'It is a draft again. Nobody is asked to approve it.');
      onDone?.();
    },
    onError: (error: Error) => toast.error('Could not withdraw the request', error.message),
  });
}

export const MODE_LABEL: Record<ApprovalMode, string> = {
  Sequential: 'One after another',
  Parallel: 'All at once',
  AnyOne: 'Any one of them',
};

export const OUTCOME_LABEL: Record<RoundOutcome, string> = {
  Pending: 'Waiting',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Stopped: 'Withdrawn',
};

/** "3 days" since a time, for "Waiting 3 days". Under a day says "today". */
export function waitedText(since: string, now = Date.now()) {
  const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
  if (days < 1) return 'less than a day';
  return days === 1 ? '1 day' : `${days} days`;
}
