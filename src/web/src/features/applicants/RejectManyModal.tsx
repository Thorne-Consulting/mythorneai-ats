'use client';

import { useState } from 'react';
import { Button, Checkbox, Modal, Select, Switch, Textarea } from '@/components/ui';
import { SendTimeSelect } from '@/features/applications/SendTime';
import {
  reasonNeedsNote,
  reasonOptions,
  useRejectionReasons,
} from '@/features/rejection-reasons/rejection-reasons-data';

/** What the bulk reject sends to `POST /api/candidates/bulk` (action "reject"). */
export type RejectManyChoice = {
  reason: string;
  /** Required when the reason asks for one; the same note goes on every application. */
  dispositionNote: string | null;
  /** From the reason's group: "They decided" closes as Withdrawn and never emails. */
  status: 'Rejected' | 'Withdrawn';
  sendEmail: boolean;
  /** ISO time to send the rejection email; null sends it now. */
  sendAt: string | null;
  cancelInterviews: boolean;
  withdrawOffer: boolean;
};

/** What Reject sends, or null while a reason, or the note it asks for, is missing. */
export function rejectManyChoice(
  form: Omit<RejectManyChoice, 'reason' | 'dispositionNote'> & {
    reason: string | null;
    note: string;
    needsNote: boolean;
  },
): RejectManyChoice | null {
  const { reason, note, needsNote, ...rest } = form;
  if (!reason || (needsNote && !note.trim())) return null;
  const emails = rest.sendEmail && rest.status !== 'Withdrawn';
  return {
    ...rest,
    reason,
    dispositionNote: needsNote ? note.trim() : null,
    sendEmail: emails,
    sendAt: emails ? rest.sendAt : null,
  };
}

/**
 * Close several applications at once, the same way as one: a reason from Settings, what to tidy
 * up (upcoming interviews, open offers), and the rejection email now, later or not at all.
 */
export function RejectManyModal({
  opened,
  onClose,
  loading,
  onReject,
  title = 'Reject selected applicants',
  count,
}: {
  opened: boolean;
  onClose: () => void;
  loading: boolean;
  onReject: (choice: RejectManyChoice) => void;
  title?: string;
  /** How many applications this rejects, for the button. */
  count?: number;
}) {
  const reasons = useRejectionReasons();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sendAt, setSendAt] = useState<string | null>(null);
  const [cancelInterviews, setCancelInterviews] = useState(true);
  const [withdrawOffer, setWithdrawOffer] = useState(true);
  const status = reasons.data?.find((r) => r.label === reason)?.kind ?? 'Rejected';
  const withdrew = reason !== null && status === 'Withdrawn';
  const needsNote = reasonNeedsNote(reasons.data, reason);
  const choice = rejectManyChoice({
    reason,
    note,
    needsNote,
    status,
    sendEmail,
    sendAt,
    cancelInterviews,
    withdrawOffer,
  });
  const one = count === 1;
  const close = () => {
    setReason(null);
    setNote('');
    setSendEmail(false);
    setSendAt(null);
    setCancelInterviews(true);
    setWithdrawOffer(true);
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title={title}
      description={one ? undefined : 'We save the same reason for everyone you selected.'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!choice}
            loading={loading}
            onClick={() => choice && onReject(choice)}
          >
            {withdrew ? 'Mark as withdrawn' : one ? 'Reject applicant' : 'Reject applicants'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Select
          label="Reason"
          description="Use job-related reasons only."
          placeholder="Choose a reason"
          value={reason}
          onChange={setReason}
          data={reasonOptions(reasons.data ?? [])}
        />
        {needsNote && (
          <Textarea
            label="Note"
            required
            description={`Say why, so the team understands later. ${one ? 'The applicant does' : 'Applicants do'} not see it.`}
            minRows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        )}
        {reason && (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-fg">Close out what is still open</h3>
            <Checkbox
              checked={cancelInterviews}
              onCheckedChange={setCancelInterviews}
              label="Cancel upcoming interviews"
              description="Interviewers are emailed and calendars are updated."
            />
            <Checkbox
              checked={withdrawOffer}
              onCheckedChange={setWithdrawOffer}
              label="Withdraw open offers"
              description="Draft, waiting and unanswered offers are withdrawn. Waiting approvals are dropped."
            />
          </section>
        )}
        {reason && withdrew && (
          <p className="text-sm text-fg-muted">
            We close {one ? 'the application' : 'the applications'} as withdrawn. No email goes out.
          </p>
        )}
        {reason && !withdrew && (
          <section className="flex flex-col gap-3">
            <Switch
              checked={sendEmail}
              onCheckedChange={setSendEmail}
              label="Send the rejection email"
              description={
                sendEmail
                  ? 'We use the job’s rejection email. People marked do not contact get nothing.'
                  : cancelInterviews
                    ? 'Anyone with an upcoming interview is told it is cancelled. Nothing else is sent.'
                    : 'Nothing is sent.'
              }
            />
            {sendEmail && <SendTimeSelect onChange={setSendAt} label="When" />}
          </section>
        )}
      </div>
    </Modal>
  );
}
