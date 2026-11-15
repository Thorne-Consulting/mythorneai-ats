'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, ConfirmDialog, Modal, toast } from '@/components/ui';
import {
  useInvalidateApprovals,
  useWithdrawApproval,
  type ApprovalMode,
  type ApprovalView,
  type PreviousRound,
} from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  ApproverPicker,
  DecideControls,
  PreviousRounds,
} from '@/features/approvals/ApprovalParts';

export interface JobApproval {
  required: boolean;
  defaultApprovers: string[];
  sequential: boolean;
  mode: ApprovalMode;
  /** The live round. */
  approvals: ApprovalView[];
  previousRounds: PreviousRound[];
}

/** Whether this organization needs approval to open jobs, and this job's approvals so far. */
export function useJobApproval(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['requisition-approval', id],
    queryFn: () => api.get<JobApproval>(`/api/requisitions/${id}/approval`),
    enabled,
    retry: false,
  });
}

/** Choose approvers and send a draft job to them. Opened from the header's "Submit for approval". */
export function SubmitForApprovalModal({
  id,
  opened,
  onClose,
}: {
  id: string;
  opened: boolean;
  onClose: () => void;
}) {
  const invalidate = useInvalidateApprovals();
  const approval = useJobApproval(id, opened).data;
  const submit = useMutation({
    mutationFn: (input: { approvers: string[]; mode: ApprovalMode; note: string }) =>
      api.post(`/api/requisitions/${id}/submit-for-approval`, input),
    onSuccess: () => {
      invalidate();
      onClose();
      toast.success(
        'Sent for approval',
        'We emailed the approvers. The job opens once they approve.',
      );
    },
    onError: (error: Error) => toast.error('Could not send the job for approval', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Submit for approval"
      description="The job opens on its own once it is approved."
      dismissable={!submit.isPending}
    >
      {approval && (
        <ApproverPicker
          defaultApprovers={approval.defaultApprovers}
          defaultMode={approval.mode}
          required
          submitLabel="Send for approval"
          loading={submit.isPending}
          onSubmit={(input) => submit.mutate(input)}
        />
      )}
    </Modal>
  );
}

/**
 * One line under the job header while approval matters: who still has to approve (with the
 * details in a modal), or who said no and why. Renders nothing otherwise.
 */
export function RequisitionApproval({
  id,
  status,
  canManage,
}: {
  id: string;
  status: string;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useWithdrawApproval(() => {
    setWithdrawing(false);
    setOpen(false);
  });
  const relevant = canManage && (status === 'Draft' || status === 'PendingApproval');
  const data = useJobApproval(id, relevant).data;
  if (!relevant || !data) return null;
  const { approvals } = data;
  const mine = approvals.find((item) => item.canDecide);

  if (status === 'PendingApproval') {
    const turn = approvals.filter((item) => item.waiting);
    const approved = approvals.filter((item) => item.decision === 'Approved').length;
    const anyOne = approvals.some((item) => item.anyOne);
    return (
      <>
        <Alert
          tone="warning"
          className="mb-5"
          title={
            mine
              ? 'You are asked to approve this job'
              : `Waiting for approval (${approved} of ${approvals.length})`
          }
          action={
            <Button
              size="sm"
              variant={mine ? 'primary' : 'secondary'}
              onClick={() => setOpen(true)}
            >
              {mine ? 'Review and decide' : 'See progress'}
            </Button>
          }
        >
          {turn.length > 0 && !mine
            ? `${turn.map((item) => item.approverName).join(', ')} ${turn.length === 1 ? 'has' : 'have'} to answer next. `
            : ''}
          {anyOne
            ? 'The job opens when one of them approves.'
            : 'The job opens when everyone approves.'}
        </Alert>
        <Modal
          opened={open}
          onClose={() => setOpen(false)}
          title="Approval"
          size="md"
          footer={
            <Button variant="danger-quiet" onClick={() => setWithdrawing(true)}>
              Withdraw request
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <ApprovalTimeline approvals={approvals} steer />
            {mine && (
              <div className="border-t border-border-subtle pt-4">
                <DecideControls approvalId={mine.id} subject="this job" />
              </div>
            )}
            <PreviousRounds rounds={data.previousRounds} />
          </div>
        </Modal>
        <ConfirmDialog
          opened={withdrawing}
          onClose={() => setWithdrawing(false)}
          title="Withdraw this request?"
          message="The job goes back to draft and nobody is asked to approve it. You can send it again later."
          confirmLabel="Withdraw request"
          onConfirm={() =>
            withdraw.mutateAsync({ subjectType: 'Requisition', subjectId: id }).then(
              () => undefined,
              () => undefined,
            )
          }
        />
      </>
    );
  }

  // A draft that came back: say who said no and why, once.
  const rejected = approvals.filter((item) => item.decision === 'Rejected');
  if (rejected.length === 0) return null;
  return (
    <Alert
      tone="danger"
      className="mb-5"
      title={`${rejected.map((item) => item.approverName).join(', ')} did not approve this job`}
    >
      {rejected.map((item) => (
        <span key={item.id} className="block whitespace-pre-wrap">
          “{item.comment}”
        </span>
      ))}
      Make the change they asked for, then submit it again.
    </Alert>
  );
}
