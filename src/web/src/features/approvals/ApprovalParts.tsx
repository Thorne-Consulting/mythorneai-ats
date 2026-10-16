'use client';

import { useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { formatDateTime } from '@/lib/format';
import { useDecideApproval, useDirectoryUsers, type ApprovalView } from './approval-data';

const decisionLabel = { Pending: 'Waiting', Approved: 'Approved', Rejected: 'Rejected' } as const;
const decisionColor = { Pending: 'gray', Approved: 'teal', Rejected: 'red' } as const;

/** Who has to approve, in order, with what they said. */
export function ApprovalTimeline({ approvals }: { approvals: ApprovalView[] }) {
  const pending = approvals.filter((item) => item.decision === 'Pending');
  const nextSequence = pending.length ? Math.min(...pending.map((item) => item.sequence)) : null;
  const ordered = new Set(approvals.map((item) => item.sequence)).size > 1;
  return (
    <Stack gap={0} component="ol" m={0} p={0} style={{ listStyle: 'none' }}>
      {approvals.map((item) => (
        <Box component="li" key={item.id} className="list-row">
          <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
            <Box style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {item.approverName}
              </Text>
              {item.comment && (
                <Text size="sm" mt={2} style={{ whiteSpace: 'pre-wrap' }}>
                  {item.comment}
                </Text>
              )}
              <Text size="xs" c="dimmed" mt={2}>
                {item.decidedAt
                  ? formatDateTime(item.decidedAt)
                  : ordered && item.sequence === nextSequence
                    ? 'Their turn now'
                    : ordered
                      ? 'Comes after the person above'
                      : 'Has not answered yet'}
              </Text>
            </Box>
            <Badge variant="light" color={decisionColor[item.decision]}>
              {decisionLabel[item.decision]}
            </Badge>
          </Group>
        </Box>
      ))}
    </Stack>
  );
}

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
    <Modal opened={opened} onClose={onClose} title={title}>
      <Stack>
        <Box>{children}</Box>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Go back
          </Button>
          <Button color={color} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Approve / Reject with a comment box. Reject needs a reason, approve does not. */
export function DecideControls({ approvalId, subject }: { approvalId: string; subject: string }) {
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
      <Group gap="sm">
        <Button onClick={() => setDecision('Approved')}>Approve</Button>
        <Button variant="default" c="red.9" onClick={() => setDecision('Rejected')}>
          Reject
        </Button>
      </Group>
      <Modal
        opened={decision !== null}
        onClose={close}
        title={rejecting ? `Reject: ${subject}` : `Approve: ${subject}`}
      >
        <Stack>
          <Textarea
            label={rejecting ? 'Why are you rejecting this?' : 'Comment (optional)'}
            description={
              rejecting ? 'The person who asked will see this and can fix it.' : undefined
            }
            required={rejecting}
            minRows={3}
            autosize
            data-autofocus
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              color={rejecting ? 'red' : undefined}
              loading={mutation.isPending}
              disabled={rejecting && !comment.trim()}
              onClick={() => decision && mutation.mutate({ id: approvalId, decision, comment })}
            >
              {rejecting ? 'Reject' : 'Approve'}
            </Button>
          </Group>
        </Stack>
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
    <Stack gap="sm">
      <MultiSelect
        label="Who needs to approve"
        description={required ? 'At least one person.' : 'Optional. Leave empty to skip approval.'}
        placeholder="Search by name"
        searchable
        data={data}
        value={approvers}
        onChange={setApprovers}
        nothingFoundMessage="No one matches that name"
      />
      {approvers.length > 1 && (
        <Switch
          label="One after another"
          description="Each person is asked only after the one before has approved."
          checked={sequential}
          onChange={(event) => setSequential(event.currentTarget.checked)}
        />
      )}
      <Group>
        <Button
          loading={loading}
          disabled={required && approvers.length === 0}
          onClick={() => onSubmit(approvers, sequential)}
        >
          {approvers.length === 0 && emptySubmitLabel ? emptySubmitLabel : submitLabel}
        </Button>
      </Group>
    </Stack>
  );
}
