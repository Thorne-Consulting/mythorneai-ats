'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { RichText } from '@/components/rich-text';
import { Alert, Button, Modal, Skeleton, Switch, toast } from '@/components/ui';
import { whenText } from '@/features/messages/inbox-format';
import type { Stage } from '@/types';
import { SendTimeSelect } from './SendTime';

type StageEmail = {
  to: string;
  subject: string;
  body: string;
  doNotContact: boolean;
  stageLabel: string;
};

/** Does moving someone into this stage need the dialog (the stage can email the candidate)? */
export const stageCanEmail = (stage?: Pick<Stage, 'emailOnEntry'>) =>
  stage?.emailOnEntry === 'Always' || stage?.emailOnEntry === 'Ask';

/**
 * Moving into a stage that emails the candidate: shows the email they would get, with the name
 * candidates see for the stage, and lets you skip it. "Always" stages start with the email on,
 * "Ask" stages with it off.
 */
export function MoveStageDialog({
  applicationId,
  firstName,
  stage,
  onClose,
  onMoved,
}: {
  applicationId: string;
  firstName: string;
  /** The stage to move to; null when closed. */
  stage: Stage | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [send, setSend] = useState(false);
  const [sendAt, setSendAt] = useState<string | null>(null);
  const email = useQuery({
    queryKey: ['stage-email', applicationId, stage?.id],
    queryFn: () =>
      api.get<StageEmail>(`/api/applications/${applicationId}/stage-email?stageId=${stage!.id}`),
    enabled: Boolean(stage),
  });
  const blocked = Boolean(email.data?.doNotContact);
  useEffect(() => {
    if (stage) setSend(stage.emailOnEntry === 'Always');
    setSendAt(null);
  }, [stage]);

  const move = useMutation({
    mutationFn: async () => {
      // The server sends the stage's email with the move: "Always" unless told not to, "Ask" when asked.
      const moved = await api.patch<{ emailIds: string[] } | undefined>(
        `/api/applications/${applicationId}/stage`,
        {
          stageId: stage!.id,
          status: 'Active',
          dispositionReason: null,
          sendEmail: send && !blocked,
          sendAt: send ? sendAt : null,
        },
      );
      return moved?.emailIds ?? [];
    },
    onSuccess: (ids) => {
      onMoved();
      onClose();
      if (ids.length === 0) {
        toast.success(`Moved to ${stage!.name}`);
        return;
      }
      // The email waits a minute (or until its time) before it goes, so it can still be taken back.
      const when = sendAt ? `goes out ${whenText(sendAt)}` : 'goes out in a minute';
      toast.success(`Moved to ${stage!.name}`, `The email to ${firstName} ${when}.`, {
        duration: 15000,
        action: {
          label: 'Don’t send',
          onClick: () =>
            api
              .post('/api/stage-emails/cancel', { ids })
              .then(() => toast.info('The email will not be sent'))
              .catch((error: Error) => toast.error('Could not stop the email', error.message)),
        },
      });
    },
    onError: (error: Error) => toast.error('Could not move this applicant', error.message),
  });

  return (
    <Modal
      opened={Boolean(stage)}
      onClose={onClose}
      title={stage ? `Move ${firstName} to ${stage.name}?` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={move.isPending} onClick={() => move.mutate()}>
            {send && !blocked ? 'Move and email' : 'Move'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {blocked ? (
          <Alert tone="warning" title={`${firstName} asked not to be contacted`}>
            The move happens without an email.
          </Alert>
        ) : (
          <Switch
            checked={send}
            onCheckedChange={setSend}
            label={`Email ${firstName} about the move`}
          />
        )}
        {!blocked && send && <SendTimeSelect onChange={setSendAt} label="When" />}
        {!blocked && send && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            {email.data ? (
              <>
                <p className="text-xs text-fg-subtle">
                  To {email.data.to} · candidates see this stage as “{email.data.stageLabel}”
                </p>
                <p className="mt-2 text-base font-semibold text-fg">{email.data.subject}</p>
                <RichText markdown={email.data.body} className="mt-2 text-sm text-fg-muted" />
              </>
            ) : email.isError ? (
              <p className="text-sm text-fg-muted">
                We could not load the email. You can still move {firstName}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
