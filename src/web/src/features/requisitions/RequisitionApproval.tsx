'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Card, CardBody, CardHeader, toast } from '@/components/ui';
import { useInvalidateApprovals, type ApprovalView } from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  ApproverPicker,
  DecideControls,
} from '@/features/approvals/ApprovalParts';

interface JobApproval {
  required: boolean;
  defaultApprovers: string[];
  sequential: boolean;
  approvals: ApprovalView[];
}

/** Submit a draft job for approval, or show who still has to approve it. Renders nothing otherwise. */
export function RequisitionApproval({
  id,
  status,
  canManage,
}: {
  id: string;
  status: string;
  canManage: boolean;
}) {
  const invalidate = useInvalidateApprovals();
  const relevant = canManage && (status === 'Draft' || status === 'PendingApproval');
  const query = useQuery({
    queryKey: ['requisition-approval', id],
    queryFn: () => api.get<JobApproval>(`/api/requisitions/${id}/approval`),
    enabled: relevant,
    retry: false,
  });
  const submit = useMutation({
    mutationFn: (input: { approvers: string[]; sequential: boolean }) =>
      api.post(`/api/requisitions/${id}/submit-for-approval`, input),
    onSuccess: () => {
      invalidate();
      toast.success(
        'Sent for approval',
        'We emailed the approvers. The job opens when they all agree.',
      );
    },
    onError: (error: Error) => toast.error('Could not send the job for approval', error.message),
  });

  if (!relevant || !query.data) return null;
  const { approvals, required } = query.data;
  const rejected = approvals.filter((item) => item.decision === 'Rejected');
  const mine = approvals.find((item) => item.canDecide);

  if (status === 'PendingApproval') {
    return (
      <Card className="mb-5">
        <CardHeader title="Waiting for approval" />
        <CardBody>
          <ApprovalTimeline approvals={approvals} />
          {mine && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DecideControls approvalId={mine.id} subject="Open this job" />
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  if (!required && rejected.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-4">
      {rejected.map((item) => (
        <Alert key={item.id} tone="danger" title={`${item.approverName} did not approve this job`}>
          <p className="whitespace-pre-wrap">{item.comment}</p>
          <p className="mt-1">Make the change they asked for, then submit it again.</p>
        </Alert>
      ))}
      {required && (
        <Card>
          <CardHeader title="This job needs approval before it opens" />
          <CardBody>
            <ApproverPicker
              defaultApprovers={query.data.defaultApprovers}
              defaultSequential={query.data.sequential}
              required
              submitLabel="Submit for approval"
              loading={submit.isPending}
              onSubmit={(approvers, sequential) => submit.mutate({ approvers, sequential })}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
