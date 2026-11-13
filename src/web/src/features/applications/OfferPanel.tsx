'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { StatusBadge } from '@/components/status';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Textarea,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ApprovalView } from '@/features/approvals/approval-data';
import { useInvalidateApprovals } from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  ApproverPicker,
  DecideControls,
} from '@/features/approvals/ApprovalParts';

export type OfferStatus = 'Draft' | 'PendingApproval' | 'Approved' | 'Sent' | 'Withdrawn';
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

/** Shared by the panel and the record's right rail (same cache entry). */
export function useOffer(applicationId: string) {
  return useQuery({
    queryKey: ['offer', applicationId],
    queryFn: () => api.get<OfferResponse>(`/api/applications/${applicationId}/offer`),
    retry: false,
  });
}

const fail = (title: string) => (error: Error) => toast.error(title, error.message);

const descriptions: Record<OfferStatus, string> = {
  Draft: 'Write a note, choose who approves, then submit.',
  PendingApproval: 'Waiting for approval. Nothing has been sent to the candidate.',
  Approved: 'Everyone approved. You can send the acceptance email.',
  Sent: 'The candidate has been told they are accepted.',
  Withdrawn: '',
};

type Action = 'send' | 'reverse' | 'withdraw';

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
  const query = useOffer(applicationId);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const done = (message: string) => () => {
    invalidate();
    setConfirm(null);
    toast.success(message);
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
    mutationFn: (input: { id: string; action: Action }) =>
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
      <Card>
        <CardHeader title="Acceptance" description="Could not load the acceptance." />
        <CardBody>
          <Button variant="soft" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }
  if (!query.data) return null;

  const { offer, approvals } = query.data;
  const live = offer && offer.status !== 'Withdrawn' ? offer : null;
  const mine = approvals.find((item) => item.canDecide);
  const rejected = approvals.filter((item) => item.decision === 'Rejected');
  if (!live && (!canManage || applicationStatus !== 'Active')) return null;

  // The dialog swallows the rejection; onError above already told the user.
  const run = (action: Action) => () =>
    live
      ? act.mutateAsync({ id: live.id, action }).then(
          () => undefined,
          () => undefined,
        )
      : undefined;

  return (
    <>
      <Card>
        <CardHeader
          title="Acceptance"
          description={
            live
              ? descriptions[live.status]
              : `Start when you are ready to accept ${candidateName}.`
          }
          action={live && <StatusBadge status={live.status} />}
        />
        <CardBody className="space-y-4">
          {!live && (
            <Button variant="secondary" loading={create.isPending} onClick={() => create.mutate()}>
              Start acceptance
            </Button>
          )}

          {live?.status === 'Draft' && (
            <>
              {rejected.map((item) => (
                <Alert key={item.id} tone="danger" title={`${item.approverName} rejected this`}>
                  <p className="whitespace-pre-wrap">{item.comment}</p>
                  <p className="mt-1">Fix what they raised, then submit again.</p>
                </Alert>
              ))}
              {canManage ? (
                <>
                  <Textarea
                    label="Note for approvers"
                    description="Why this person, and anything the approvers should know."
                    minRows={3}
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
                <p className="text-sm text-fg-subtle">The recruiter is still preparing this.</p>
              )}
            </>
          )}

          {(live?.status === 'PendingApproval' || live?.status === 'Approved') && (
            <>
              {live.note && <NoteBlock note={live.note} by={live.createdBy} />}
              <ApprovalTimeline approvals={approvals} />
              {live.status === 'PendingApproval' && mine && (
                <DecideControls approvalId={mine.id} subject={`Accept ${candidateName}`} />
              )}
              {live.status === 'Approved' && canManage && (
                <Button onClick={() => setConfirm('send')}>Send acceptance email</Button>
              )}
            </>
          )}

          {live?.status === 'Sent' && (
            <>
              <p className="text-base text-fg">
                Sent{live.sentAt ? ` on ${formatDateTime(live.sentAt)}` : ''}. {candidateName} is
                marked Hired.
              </p>
              {canManage && (
                <Button variant="quiet" size="xs" onClick={() => setConfirm('reverse')}>
                  Reverse
                </Button>
              )}
            </>
          )}
          {canManage && live && live.status !== 'Sent' && (
            <div>
              <Button variant="quiet" size="xs" onClick={() => setConfirm('withdraw')}>
                Withdraw acceptance
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {live && (
        <>
          <ConfirmDialog
            opened={confirm === 'send'}
            onClose={() => setConfirm(null)}
            title="Send the acceptance email?"
            confirmLabel="Send email and mark Hired"
            confirmVariant="primary"
            onConfirm={run('send')}
            message={
              <div className="space-y-2">
                <p>Two things happen right away:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    {candidateName} gets a plain email: you have been accepted, and the team will
                    contact you shortly.
                  </li>
                  <li>The application moves to Hired.</li>
                </ol>
                <p className="text-fg-subtle">The email cannot be unsent.</p>
              </div>
            }
          />
          <ConfirmDialog
            opened={confirm === 'reverse'}
            onClose={() => setConfirm(null)}
            title="Reverse this acceptance?"
            confirmLabel="Reverse acceptance"
            onConfirm={run('reverse')}
            message={`Use this if ${candidateName} falls through. The application goes back to the stage it was in before. This does not unsend the email they already got, so you may want to message them yourself.`}
          />
          <ConfirmDialog
            opened={confirm === 'withdraw'}
            onClose={() => setConfirm(null)}
            title="Withdraw this acceptance?"
            confirmLabel="Withdraw"
            onConfirm={run('withdraw')}
            message="Nothing has been sent to the candidate. Any approvals so far are dropped, and you can start a new acceptance later."
          />
        </>
      )}
    </>
  );
}

function NoteBlock({ note, by }: { note: string; by: string }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs font-medium text-fg-subtle">Note from {by.split('@')[0]}</p>
      <p className="mt-1 whitespace-pre-wrap text-base text-fg">{note}</p>
    </div>
  );
}
