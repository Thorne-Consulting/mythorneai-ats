'use client';

import { useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, Checkbox, Modal, Select, Switch, Textarea, toast } from '@/components/ui';
import { whenText } from '@/features/messages/inbox-format';
import {
  reasonNeedsNote,
  reasonOptions,
  useRejectionReasons,
} from '@/features/rejection-reasons/rejection-reasons-data';
import { EmailFrame } from '@/features/templates/editor-tools';
import { useTemplate, type TemplatePreview } from '@/features/templates/templates-data';
import { formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import type { ApplicationData, ModalProps } from './application-types';
import { useOffer } from './offer-data';
import { SendTimeSelect } from './SendTime';

const OPEN_OFFER = ['Draft', 'PendingApproval', 'Approved', 'Sent'];
const OFFER_WORDS: Record<string, string> = {
  Draft: 'a draft offer',
  PendingApproval: 'an offer waiting for approval',
  Approved: 'an approved offer that is not sent yet',
  Sent: 'an offer they have not answered',
};

/**
 * What is still open on an application when it closes (upcoming interviews, an offer) and the
 * person's choice to tidy each up. Both are on by default. Shared by the reject dialog and the
 * Feedback tab's Decision panel.
 */
export function useCloseOut(applicationId: string, enabled: boolean) {
  // The same cache entry as the record page, loaded here only when the dialog opens elsewhere.
  const detail = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => api.get<ApplicationData>(`/api/applications/${applicationId}`),
    enabled,
  });
  const offer = useOffer(applicationId, enabled);
  const [cancelInterviews, setCancelInterviews] = useState(true);
  const [withdrawOffer, setWithdrawOffer] = useState(true);
  const upcoming = (detail.data?.application.interviews ?? []).filter(
    (i) => ['Scheduled', 'Proposed'].includes(i.status) && new Date(i.endsAt) > new Date(),
  );
  const openOffer =
    offer.data?.offer && OPEN_OFFER.includes(offer.data.offer.status) ? offer.data.offer : null;
  return {
    detail,
    upcoming,
    openOffer,
    cancelInterviews,
    setCancelInterviews,
    withdrawOffer,
    setWithdrawOffer,
    reset: () => {
      setCancelInterviews(true);
      setWithdrawOffer(true);
    },
    /** For the request body. */
    choices: {
      cancelInterviews: upcoming.length > 0 && cancelInterviews,
      withdrawOffer: Boolean(openOffer) && withdrawOffer,
    },
  };
}

/** "Close out what is still open": a checkbox per open thing, or nothing when nothing is open. */
export function CloseOutChoices({
  closeOut,
  firstName,
}: {
  closeOut: ReturnType<typeof useCloseOut>;
  firstName: string;
}) {
  const { upcoming, openOffer } = closeOut;
  if (upcoming.length === 0 && !openOffer) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-fg">Close out what is still open</h3>
      {upcoming.length > 0 && (
        <Checkbox
          checked={closeOut.cancelInterviews}
          onCheckedChange={closeOut.setCancelInterviews}
          label={`Cancel ${upcoming.length === 1 ? 'the upcoming interview' : `${upcoming.length} upcoming interviews`}`}
          description={
            <>
              {upcoming.map((i) => `${i.title}, ${formatDateTime(i.startsAt)}`).join(' · ')}.
              Interviewers are emailed and calendars are updated.
            </>
          }
        />
      )}
      {openOffer && (
        <Checkbox
          checked={closeOut.withdrawOffer}
          onCheckedChange={closeOut.setWithdrawOffer}
          label="Withdraw the offer"
          description={`${firstName} has ${OFFER_WORDS[openOffer.status]}. Waiting approvals are dropped.`}
        />
      )}
    </section>
  );
}

/**
 * The rejection email as the candidate will get it: this job's wording (or your own message),
 * filled with their details, in the branded layout. Folded away until asked for.
 */
function RejectionEmailPreview({
  applicationId,
  requisitionId,
  message,
}: {
  applicationId: string;
  requisitionId?: string;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  const template = useTemplate(open ? 'rejection' : null, requisitionId);
  const body = useDebouncedValue(message, 400);
  const preview = useQuery({
    queryKey: ['rejection-preview', applicationId, template.data?.version, body],
    queryFn: () =>
      api.post<TemplatePreview>('/api/templates/preview', {
        subject: template.data!.subject,
        body: body.trim() || template.data!.body,
        id: 'rejection',
        applicationId,
      }),
    enabled: open && !!template.data,
    placeholderData: (previous) => previous,
  });
  return (
    <div className="space-y-2">
      <Button
        variant="link"
        size="sm"
        leftIcon={open ? <EyeOff /> : <Eye />}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide the email' : 'Preview the email'}
      </Button>
      {open &&
        (preview.data ? (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="text-fg-subtle">Subject: </span>
              <span className="font-medium text-fg">{preview.data.subject}</span>
            </p>
            <div className="max-h-96 overflow-y-auto rounded-lg">
              <EmailFrame html={preview.data.html} title="The rejection email" />
            </div>
          </div>
        ) : preview.isError || template.isError ? (
          <p className="text-sm text-destructive">The preview didn’t load. You can still send.</p>
        ) : (
          <p className="text-sm text-fg-subtle">Loading the email…</p>
        ))}
    </div>
  );
}

/**
 * Closing an application: a reason from Settings (we decided, or they withdrew), a note when the
 * reason asks for one, what to tidy up (upcoming interviews, an open offer), and the rejection
 * email now, later or not at all, with a preview.
 */
export function RejectModal({
  applicationId,
  stageId,
  firstName,
  doNotContact,
  opened,
  onClose,
  onSaved,
}: ModalProps & {
  applicationId: string;
  stageId: string;
  firstName: string;
  doNotContact: boolean;
}) {
  const reasons = useRejectionReasons();
  const closeOut = useCloseOut(applicationId, opened);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState('');
  const [email, setEmail] = useState(true);
  const [sendAt, setSendAt] = useState<string | null>(null);

  const kind = reasons.data?.find((r) => r.label === reason)?.kind ?? 'Rejected';
  const withdrew = reason !== null && kind === 'Withdrawn';
  const emails = !withdrew && !doNotContact && email;
  const needsNote = reasonNeedsNote(reasons.data, reason);
  const upcoming = closeOut.upcoming;

  const reset = () => {
    setReason(null);
    setNote('');
    setDraft('');
    setEmail(true);
    setSendAt(null);
    closeOut.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const draftMutation = useMutation({
    mutationFn: () =>
      api.post<{ draft: string }>('/api/ai/draft-message', {
        applicationId,
        purpose: 'rejection message',
        notes: reason ?? '',
      }),
    onSuccess: (result) => setDraft(result.draft),
    onError: (error: Error) => toast.error('Could not draft a message', error.message),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ emailIds?: string[] } | undefined>(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: kind,
        dispositionReason: reason,
        dispositionNote: note.trim() || null,
        message: emails ? draft || null : null,
        sendEmail: withdrew ? undefined : emails,
        sendAt: emails ? sendAt : null,
        ...closeOut.choices,
      }),
    onSuccess: (result) => {
      const scheduled = emails && sendAt ? result?.emailIds?.[0] : undefined;
      onSaved();
      close();
      const title = withdrew ? 'Marked as withdrawn' : 'Applicant rejected';
      if (!scheduled) return toast.success(title);
      toast.success(title, `The email goes out ${whenText(sendAt!)}.`, {
        duration: 15000,
        action: {
          label: 'Cancel email',
          onClick: () =>
            api
              .post(`/api/applications/${applicationId}/emails/${scheduled}/cancel`)
              .then(() => {
                toast.info('The email will not be sent');
                onSaved();
              })
              .catch((error: Error) => toast.error('Could not cancel the email', error.message)),
        },
      });
    },
    onError: (error: Error) => toast.error('Could not save this', error.message),
  });

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={withdrew ? 'Mark as withdrawn' : 'Reject applicant'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reason || (needsNote && !note.trim())}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {withdrew ? 'Mark as withdrawn' : 'Reject applicant'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
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
            description={`Say why, so the team understands later. ${firstName} does not see it.`}
            minRows={2}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        )}

        {reason && <CloseOutChoices closeOut={closeOut} firstName={firstName} />}

        {reason && (withdrew || doNotContact) && (
          <Alert tone="info">
            {withdrew
              ? `${firstName} is not emailed.`
              : `${firstName} asked not to be contacted, so no email is sent.`}
          </Alert>
        )}
        {reason && !withdrew && !doNotContact && (
          <section className="space-y-3">
            <Switch
              checked={email}
              onCheckedChange={setEmail}
              label={`Email ${firstName}`}
              description={
                email
                  ? draft
                    ? 'They get your message below.'
                    : 'They get the standard rejection email.'
                  : closeOut.choices.cancelInterviews
                    ? 'They are told about each cancelled interview instead.'
                    : 'Nothing is sent.'
              }
            />
            {email && (
              <>
                <SendTimeSelect onChange={setSendAt} label="When" />
                {draft ? (
                  <Textarea
                    label="Message to the candidate"
                    description="An AI draft. Check and edit it before you send."
                    minRows={6}
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="soft"
                    leftIcon={<Sparkles />}
                    loading={draftMutation.isPending}
                    onClick={() => draftMutation.mutate()}
                  >
                    Write a personal message with AI
                  </Button>
                )}
                <RejectionEmailPreview
                  applicationId={applicationId}
                  requisitionId={closeOut.detail.data?.application.requisitionId}
                  message={draft}
                />
              </>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
