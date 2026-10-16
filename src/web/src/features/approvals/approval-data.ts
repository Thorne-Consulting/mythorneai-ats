import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

export interface PendingApproval {
  id: string;
  type: 'Offer' | 'Requisition';
  title: string;
  detail: string;
  note: string;
  applicationId: string | null;
  requisitionId: string | null;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
}

// Approvals waiting on the signed-in user. Also drives the badge in the sidebar.
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'mine'],
    queryFn: () => api.get<PendingApproval[]>('/api/approvals/mine'),
    refetchInterval: 60_000,
  });
}

export interface ApprovalView {
  id: string;
  approverEmail: string;
  approverName: string;
  sequence: number;
  decision: 'Pending' | 'Approved' | 'Rejected';
  comment?: string | null;
  decidedAt?: string | null;
  canDecide: boolean;
}

export type DirectoryUser = { email: string; displayName: string; role: string };

export function useDirectoryUsers() {
  return useQuery({
    queryKey: ['directory-users'],
    queryFn: () => api.get<DirectoryUser[]>('/api/directory/users'),
  });
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
      notifications.show({ color: 'teal', message });
      onDone?.();
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not save your decision',
        message: error.message,
      }),
  });
}
