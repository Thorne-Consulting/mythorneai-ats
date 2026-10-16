'use client';

import { useState } from 'react';
import { Alert, Box, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import { formatDateTime } from '@/lib/format';
import type { ApprovalView } from '@/features/approvals/approval-data';
import { useInvalidateApprovals } from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  ApproverPicker,
  ConfirmModal,
  DecideControls,
} from '@/features/approvals/ApprovalParts';

type OfferStatus = 'Draft' | 'PendingApproval' | 'Approved' | 'Sent' | 'Withdrawn';
interface OfferResponse {
  offer: {
    id: string;
    status: OfferStatus;
    note: string;
    createdBy: string;
    sentAt?: string;
  } | null;
  approvals: ApprovalView[];
  approvalRequired: boolean;
  defaultApprovers: string[];
  sequential: boolean;
}

const fail = (title: string) => (error: Error) =>
  notifications.show({ color: 'red', title, message: error.message });

/** Acceptance: draft, approvals, send. Hides itself for people who cannot see it. */
export function OfferPanel({
  applicationId,
  applicationStatus,
  candidateName,
  canManage,
}: {
  applicationId: string;
  applicationStatus: string;
  candidateName: string;
  canManage: boolean;
}) {
  const invalidate = useInvalidateApprovals();
  const query = useQuery({
    queryKey: ['offer', applicationId],
    queryFn: () => api.get<OfferResponse>(`/api/applications/${applicationId}/offer`),
    retry: false,
  });
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'send' | 'reverse' | 'withdraw' | null>(null);
  const done = (message: string) => () => {
    invalidate();
    setConfirm(null);
    notifications.show({ color: 'teal', message });
  };

  const create = useMutation({
    mutationFn: () => api.post(`/api/applications/${applicationId}/offer`, { note: '' }),
    onSuccess: done('Acceptance started. Add a note and choose who approves it.'),
    onError: fail('Could not start the acceptance'),
  });
  const submit = useMutation({
    mutationFn: async (input: { id: string; approvers: string[]; sequential: boolean }) => {
      await api.put(`/api/offers/${input.id}`, { note: note ?? query.data?.offer?.note ?? '' });
      await api.post(`/api/offers/${input.id}/submit`, {
        approvers: input.approvers,
        sequential: input.sequential,
      });
    },
    onSuccess: (_, input) => {
      setNote(null);
      done(
        input.approvers.length
          ? 'Sent for approval. Approvers have been emailed.'
          : 'Ready to send. No approval was needed.',
      )();
    },
    onError: fail('Could not submit the acceptance'),
  });
  const act = useMutation({
    mutationFn: (input: { id: string; action: 'send' | 'reverse' | 'withdraw' }) =>
      api.post(`/api/offers/${input.id}/${input.action}`),
    onSuccess: (_, input) =>
      done(
        {
          send: `Acceptance email sent. ${candidateName} is now Hired.`,
          reverse: 'Acceptance reversed. The application is back where it was.',
          withdraw: 'Acceptance withdrawn.',
        }[input.action],
      )(),
    onError: (error: Error) => {
      setConfirm(null);
      fail('That did not go through')(error);
    },
  });

  if (query.isError) {
    // 404 means this person has nothing to do here; anything else deserves a retry.
    if (query.error instanceof ApiError && query.error.status === 404) return null;
    return (
      <SectionCard title="Acceptance">
        <Group p="lg">
          <Button variant="light" onClick={() => query.refetch()}>
            Try again
          </Button>
        </Group>
      </SectionCard>
    );
  }
  if (!query.data) return null;

  const { offer, approvals } = query.data;
  const live = offer && offer.status !== 'Withdrawn' ? offer : null;
  const mine = approvals.find((item) => item.canDecide);
  const rejected = approvals.filter((item) => item.decision === 'Rejected');
  if (!live && (!canManage || applicationStatus !== 'Active')) return null;

  const descriptions: Record<OfferStatus, string> = {
    Draft: 'Write a note, choose who approves, then submit.',
    PendingApproval: 'Waiting for approval. Nothing has been sent to the candidate.',
    Approved: 'Everyone approved. You can send the acceptance email.',
    Sent: 'The candidate has been told they are accepted.',
    Withdrawn: '',
  };
  const withdrawButton = canManage && live && live.status !== 'Sent' && (
    <Button variant="subtle" color="gray" size="xs" onClick={() => setConfirm('withdraw')}>
      Withdraw acceptance
    </Button>
  );

  return (
    <>
      <SectionCard title="Acceptance">
        <Stack gap="md" p="lg">
          {!live && (
            <Group>
              <Button variant="default" loading={create.isPending} onClick={() => create.mutate()}>
                Start acceptance
              </Button>
            </Group>
          )}

          {live?.status === 'Draft' && (
            <>
              {rejected.map((item) => (
                <Alert
                  key={item.id}
                  color="red"
                  variant="light"
                  title={`${item.approverName} rejected this`}
                >
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {item.comment}
                  </Text>
                  <Text size="sm" mt={4}>
                    Fix what they raised, then submit again.
                  </Text>
                </Alert>
              ))}
              {canManage ? (
                <>
                  <Textarea
                    label="Note for approvers"
                    description="Why this person, and anything the approvers should know."
                    minRows={3}
                    autosize
                    value={note ?? live.note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                  />
                  <ApproverPicker
                    defaultApprovers={query.data.defaultApprovers}
                    defaultSequential={query.data.sequential}
                    required={query.data.approvalRequired}
                    submitLabel="Submit for approval"
                    emptySubmitLabel="Mark ready to send"
                    loading={submit.isPending}
                    onSubmit={(approvers, sequential) =>
                      submit.mutate({ id: live.id, approvers, sequential })
                    }
                  />
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  The recruiter is still preparing this.
                </Text>
              )}
            </>
          )}

          {live?.status === 'PendingApproval' && (
            <>
              {live.note && <NoteBlock note={live.note} by={live.createdBy} />}
              <Box mx="calc(var(--mantine-spacing-lg) * -1)">
                <ApprovalTimeline approvals={approvals} />
              </Box>
              {mine && <DecideControls approvalId={mine.id} subject={`Accept ${candidateName}`} />}
            </>
          )}

          {live?.status === 'Approved' && (
            <>
              {live.note && <NoteBlock note={live.note} by={live.createdBy} />}
              <Box mx="calc(var(--mantine-spacing-lg) * -1)">
                <ApprovalTimeline approvals={approvals} />
              </Box>
              {canManage && (
                <Group>
                  <Button onClick={() => setConfirm('send')}>Send acceptance email</Button>
                </Group>
              )}
            </>
          )}

          {live?.status === 'Sent' && (
            <>
              <Text size="sm">
                Sent{live.sentAt ? ` on ${formatDateTime(live.sentAt)}` : ''}. {candidateName} is
                marked Hired.
              </Text>
              {canManage && (
                <Group>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() => setConfirm('reverse')}
                  >
                    Reverse
                  </Button>
                </Group>
              )}
            </>
          )}
          {withdrawButton && <Group>{withdrawButton}</Group>}
        </Stack>
      </SectionCard>

      {live && (
        <>
          <ConfirmModal
            opened={confirm === 'send'}
            onClose={() => setConfirm(null)}
            title="Send the acceptance email?"
            confirmLabel="Send email and mark Hired"
            loading={act.isPending}
            onConfirm={() => act.mutate({ id: live.id, action: 'send' })}
          >
            <Stack gap="xs">
              <Text size="sm">Two things happen right away:</Text>
              <Text size="sm">
                1. {candidateName} gets a plain email: you have been accepted, and the team will
                contact you shortly.
              </Text>
              <Text size="sm">2. The application moves to Hired.</Text>
              <Text size="sm" c="dimmed">
                The email cannot be unsent.
              </Text>
            </Stack>
          </ConfirmModal>
          <ConfirmModal
            opened={confirm === 'reverse'}
            onClose={() => setConfirm(null)}
            title="Reverse this acceptance?"
            confirmLabel="Reverse acceptance"
            color="red"
            loading={act.isPending}
            onConfirm={() => act.mutate({ id: live.id, action: 'reverse' })}
          >
            <Text size="sm">
              Use this if {candidateName} falls through. The application goes back to the stage it
              was in before. This does not unsend the email they already got, so you may want to
              message them yourself.
            </Text>
          </ConfirmModal>
          <ConfirmModal
            opened={confirm === 'withdraw'}
            onClose={() => setConfirm(null)}
            title="Withdraw this acceptance?"
            confirmLabel="Withdraw"
            color="red"
            loading={act.isPending}
            onConfirm={() => act.mutate({ id: live.id, action: 'withdraw' })}
          >
            <Text size="sm">
              Nothing has been sent to the candidate. Any approvals so far are dropped, and you can
              start a new acceptance later.
            </Text>
          </ConfirmModal>
        </>
      )}
    </>
  );
}

function NoteBlock({ note, by }: { note: string; by: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={600}>
        Note from {by.split('@')[0]}
      </Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {note}
      </Text>
    </Box>
  );
}
