'use client';

import { useState } from 'react';
import { Check, History, UserRoundPen, X } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { canManageWorkspace, useAbility } from '@/lib/ability';
import {
  Badge,
  Button,
  Collapse,
  Modal,
  MultiSelect,
  SegmentedControl,
  SearchSelect,
  Textarea,
  type Tone,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  MODE_LABEL,
  OUTCOME_LABEL,
  useApproverOptions,
  useDecideApproval,
  useReassignApprover,
  useRemindApprover,
  type ApprovalMode,
  type ApprovalView,
  type PreviousRound,
  type RoundOutcome,
} from './approval-data';

const decisionLabel = {
  Pending: 'Waiting',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Cancelled: 'Not needed',
} as const;
const decisionTone: Record<ApprovalView['decision'], Tone> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Cancelled: 'gray',
};
export const outcomeTone: Record<RoundOutcome, Tone> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'red',
  Stopped: 'gray',
};

/**
 * Who has to approve, in order, with what they said. With `steer`, the requester (or an admin)
 * can remind the person whose turn it is or hand their step to someone else.
 */
export function ApprovalTimeline({
  approvals,
  steer = false,
}: {
  approvals: ApprovalView[];
  steer?: boolean;
}) {
  const user = useCurrentUser();
  const admin = canManageWorkspace(useAbility());
  const remind = useRemindApprover();
  const [replacing, setReplacing] = useState<ApprovalView | null>(null);
  const ordered = new Set(approvals.map((item) => item.sequence)).size > 1;
  const me = user.email.toLowerCase();
  return (
    <>
      <ol className="divide-y divide-border-subtle">
        {approvals.map((item) => {
          // A step the organization requires is handed on only by an admin or the approver.
          const canReplace =
            item.decision === 'Pending' &&
            (item.approverEmail === me || (steer && (!item.fromPolicy || admin)));
          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{item.approverName}</p>
                {item.reassignedFromName && (
                  <p className="text-xs text-fg-subtle">
                    Instead of {item.reassignedFromName}
                    {item.reassignedByName ? `, changed by ${item.reassignedByName}` : ''}
                  </p>
                )}
                {item.comment && (
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg-muted">{item.comment}</p>
                )}
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {item.decidedAt && item.decision !== 'Cancelled'
                    ? formatDateTime(item.decidedAt)
                    : item.decision === 'Cancelled'
                      ? 'The request ended before they answered'
                      : item.waiting
                        ? item.lastRemindedAt
                          ? `Their turn now · reminded ${formatDateTime(item.lastRemindedAt)}`
                          : 'Their turn now'
                        : ordered
                          ? 'Comes after the person above'
                          : 'Has not answered yet'}
                </p>
                {(canReplace || (steer && item.waiting)) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {steer && item.waiting && (
                      <Button
                        size="xs"
                        variant="quiet"
                        loading={remind.isPending && remind.variables === item.id}
                        onClick={() => remind.mutate(item.id)}
                      >
                        Send a reminder
                      </Button>
                    )}
                    {canReplace && (
                      <Button
                        size="xs"
                        variant="quiet"
                        leftIcon={<UserRoundPen />}
                        onClick={() => setReplacing(item)}
                      >
                        {item.approverEmail === me ? 'Hand to someone else' : 'Replace approver'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <Badge dot tone={decisionTone[item.decision]}>
                {decisionLabel[item.decision]}
              </Badge>
            </li>
          );
        })}
      </ol>
      <ReplaceApproverModal
        item={replacing}
        exclude={approvals.map((item) => item.approverEmail)}
        onClose={() => setReplacing(null)}
      />
    </>
  );
}

function ReplaceApproverModal({
  item,
  exclude,
  onClose,
}: {
  item: ApprovalView | null;
  exclude: string[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const options = useApproverOptions(exclude);
  const reassign = useReassignApprover(() => {
    setEmail(null);
    onClose();
  });
  return (
    <Modal
      opened={item !== null}
      onClose={onClose}
      title={`Replace ${item?.approverName ?? 'approver'}`}
      description="Use this when they are away or have left. We ask the new person right away."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={reassign.isPending}
            disabled={!email}
            onClick={() => item && email && reassign.mutate({ id: item.id, approverEmail: email })}
          >
            Replace approver
          </Button>
        </>
      }
    >
      <SearchSelect
        label="New approver"
        placeholder="Search by name"
        data={options}
        value={email}
        onChange={setEmail}
        nothingFound="No one matches that name"
      />
    </Modal>
  );
}

/** Earlier rounds, newest first, folded away under one line. */
export function PreviousRounds({ rounds }: { rounds: PreviousRound[] }) {
  const [open, setOpen] = useState(false);
  if (rounds.length === 0) return null;
  return (
    <div className="border-t border-border-subtle pt-3">
      <Button
        variant="link"
        size="sm"
        leftIcon={<History />}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? 'Hide earlier requests'
          : `Show ${rounds.length === 1 ? 'the earlier request' : `${rounds.length} earlier requests`}`}
      </Button>
      <Collapse open={open}>
        <div className="mt-3 space-y-4">
          {rounds.map((round) => (
            <section key={round.round} className="rounded-lg bg-muted p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-fg-subtle">
                  Asked {formatDateTime(round.createdAt)}
                  {round.requestedByName ? ` by ${round.requestedByName}` : ''}
                </p>
                <Badge tone={outcomeTone[round.outcome]}>{OUTCOME_LABEL[round.outcome]}</Badge>
              </div>
              {round.note && (
                <p className="mb-2 text-sm whitespace-pre-wrap text-fg-muted">“{round.note}”</p>
              )}
              <ApprovalTimeline approvals={round.approvals} />
            </section>
          ))}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * Approve / Reject. Both ask first; rejecting is the confirm step for a destructive decision and
 * needs a reason, approving takes an optional comment.
 */
export function DecideControls({
  approvalId,
  subject,
  size = 'md',
  initial = null,
}: {
  approvalId: string;
  subject: string;
  size?: 'sm' | 'md';
  /** Open the dialog for this decision on arrival (from a link in an email). */
  initial?: 'Approved' | 'Rejected' | null;
}) {
  const [decision, setDecision] = useState<'Approved' | 'Rejected' | null>(initial);
  const [comment, setComment] = useState('');
  const close = () => {
    setDecision(null);
    setComment('');
  };
  const mutation = useDecideApproval(close);
  const rejecting = decision === 'Rejected';
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size={size}
          variant="secondary"
          className="text-destructive hover:text-destructive"
          leftIcon={<X />}
          onClick={() => setDecision('Rejected')}
        >
          Reject
        </Button>
        <Button size={size} leftIcon={<Check />} onClick={() => setDecision('Approved')}>
          Approve
        </Button>
      </div>
      <Modal
        opened={decision !== null}
        onClose={close}
        title={rejecting ? `Reject ${subject}?` : `Approve ${subject}?`}
        description={
          rejecting ? 'The person who asked will see your reason and can fix it.' : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={rejecting ? 'danger' : 'primary'}
              loading={mutation.isPending}
              disabled={rejecting && !comment.trim()}
              onClick={() => decision && mutation.mutate({ id: approvalId, decision, comment })}
            >
              {rejecting ? 'Reject' : 'Approve'}
            </Button>
          </>
        }
      >
        <Textarea
          label={rejecting ? 'Why are you rejecting this?' : 'Comment (optional)'}
          required={rejecting}
          minRows={3}
          autoFocus
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
        />
      </Modal>
    </>
  );
}

/**
 * Choose approvers (pre-filled with the organization's chain), how they decide, and a note.
 * Only an admin can ask less than the organization's rule; the server checks it too.
 */
export function ApproverPicker({
  defaultApprovers,
  defaultMode,
  required,
  submitLabel,
  emptySubmitLabel,
  loading,
  onSubmit,
}: {
  defaultApprovers: string[];
  defaultMode: ApprovalMode;
  required: boolean;
  submitLabel: string;
  emptySubmitLabel?: string;
  loading?: boolean;
  onSubmit: (input: { approvers: string[]; mode: ApprovalMode; note: string }) => void;
}) {
  const admin = canManageWorkspace(useAbility());
  const options = useApproverOptions();
  const [approvers, setApprovers] = useState<string[]>(defaultApprovers);
  const [mode, setMode] = useState<ApprovalMode>(defaultMode);
  const [note, setNote] = useState('');
  const strength = { AnyOne: 0, Parallel: 1, Sequential: 2 } as const;
  const modes = (Object.keys(MODE_LABEL) as ApprovalMode[]).filter(
    (value) => admin || strength[value] >= strength[defaultMode],
  );
  // Defaults may name people the directory no longer lists; keep them selectable.
  const data = [...options];
  for (const email of approvers)
    if (!data.some((item) => item.value === email)) data.push({ value: email, label: email });
  // Everyone except an admin keeps the organization's approvers.
  const locked = admin ? [] : defaultApprovers;
  return (
    <div className="flex flex-col gap-4">
      <MultiSelect
        label="Who needs to approve"
        description={
          locked.length
            ? 'Your organization’s approvers are already in the list. You can add more people.'
            : required
              ? 'Pick at least one person.'
              : 'Leave this empty to skip approval.'
        }
        placeholder="Search by name"
        data={data}
        value={approvers}
        onChange={(next) => setApprovers([...new Set([...locked, ...next])])}
        nothingFound="No one matches that name"
      />
      {approvers.length > 1 && modes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-fg">How they decide</p>
          <SegmentedControl
            aria-label="How they decide"
            value={mode}
            onValueChange={(value) => setMode(value as ApprovalMode)}
            items={modes.map((value) => ({ value, label: MODE_LABEL[value] }))}
          />
        </div>
      )}
      <Textarea
        label="Note to approvers (optional)"
        description="For example, why the role is needed now."
        minRows={2}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      <div>
        <Button
          loading={loading}
          disabled={required && approvers.length === 0}
          onClick={() => onSubmit({ approvers, mode, note })}
        >
          {approvers.length === 0 && emptySubmitLabel ? emptySubmitLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
