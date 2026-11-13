'use client';

import { useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Badge, Button, Modal, MultiSelect, Switch, Textarea, type Tone } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useDecideApproval, useDirectoryUsers, type ApprovalView } from './approval-data';

const decisionLabel = { Pending: 'Waiting', Approved: 'Approved', Rejected: 'Rejected' } as const;
const decisionTone: Record<ApprovalView['decision'], Tone> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'red',
};

/** Who has to approve, in order, with what they said. */
export function ApprovalTimeline({ approvals }: { approvals: ApprovalView[] }) {
  const pending = approvals.filter((item) => item.decision === 'Pending');
  const nextSequence = pending.length ? Math.min(...pending.map((item) => item.sequence)) : null;
  const ordered = new Set(approvals.map((item) => item.sequence)).size > 1;
  return (
    <ol className="divide-y divide-border-subtle">
      {approvals.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{item.approverName}</p>
            {item.comment && (
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg-muted">{item.comment}</p>
            )}
            <p className="mt-0.5 text-xs text-fg-subtle">
              {item.decidedAt
                ? formatDateTime(item.decidedAt)
                : ordered && item.sequence === nextSequence
                  ? 'Their turn now'
                  : ordered
                    ? 'Comes after the person above'
                    : 'Has not answered yet'}
            </p>
          </div>
          <Badge dot tone={decisionTone[item.decision]}>
            {decisionLabel[item.decision]}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

/** Confirm step with custom body. `color="red"` makes the confirm button destructive. */
export function ConfirmModal({
  opened,
  onClose,
  title,
  confirmLabel,
  loading,
  onConfirm,
  color,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
          <Button
            variant={color === 'red' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-base text-fg-muted">{children}</div>
    </Modal>
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
}: {
  approvalId: string;
  subject: string;
  size?: 'sm' | 'md';
}) {
  const [decision, setDecision] = useState<'Approved' | 'Rejected' | null>(null);
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

/** Choose approvers (pre-filled) and whether they go one after another. */
export function ApproverPicker({
  defaultApprovers,
  defaultSequential,
  required,
  submitLabel,
  emptySubmitLabel,
  loading,
  onSubmit,
}: {
  defaultApprovers: string[];
  defaultSequential: boolean;
  required: boolean;
  submitLabel: string;
  emptySubmitLabel?: string;
  loading?: boolean;
  onSubmit: (approvers: string[], sequential: boolean) => void;
}) {
  const directory = useDirectoryUsers();
  const [approvers, setApprovers] = useState<string[]>(defaultApprovers);
  const [sequential, setSequential] = useState(defaultSequential);
  const data = (directory.data ?? []).map((person) => ({
    value: person.email,
    label: `${person.displayName} · ${person.email}`,
  }));
  // Defaults may name people the directory no longer lists; keep them selectable.
  for (const email of approvers)
    if (!data.some((item) => item.value === email)) data.push({ value: email, label: email });
  return (
    <div className="flex flex-col gap-3">
      <MultiSelect
        label="Who needs to approve"
        description={required ? 'At least one person.' : 'Optional. Leave empty to skip approval.'}
        placeholder="Search by name"
        data={data}
        value={approvers}
        onChange={setApprovers}
        nothingFound="No one matches that name"
      />
      {approvers.length > 1 && (
        <Switch
          label="One after another"
          description="Each person is asked only after the one before has approved."
          checked={sequential}
          onCheckedChange={setSequential}
        />
      )}
      <div>
        <Button
          loading={loading}
          disabled={required && approvers.length === 0}
          onClick={() => onSubmit(approvers, sequential)}
        >
          {approvers.length === 0 && emptySubmitLabel ? emptySubmitLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
