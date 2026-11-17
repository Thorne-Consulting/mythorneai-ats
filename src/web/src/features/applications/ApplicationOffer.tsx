'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Download, FileSignature, Pencil, RotateCcw, Send, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { StatusBadge } from '@/components/status';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Input,
  Modal,
  MultiSelect,
  NumberInput,
  SearchSelect,
  Select,
  SkeletonRows,
  Steps,
  Switch,
  Textarea,
  Wizard,
  toast,
} from '@/components/ui';
import { useDirectoryUsers, useInvalidateApprovals } from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  DecideControls,
  PreviousRounds,
} from '@/features/approvals/ApprovalParts';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { LoadError, useApplication, useInvalidateApplication } from './application-data';
import { LetterPaper } from '@/features/offer-letters/LetterPaper';
import { liveOffer, useOffer, type Offer, type OfferResponse } from './offer-data';
import { LetterEditor, LetterPreview, type LetterDraft } from './OfferLetter';
import { OFFER_STEPS, offerStep, termRows } from './offer-terms';
import { useSupportedCurrencyCodes } from '@/features/currencies/currency-data';

const PAY_PERIODS = [
  { value: 'Year', label: 'Year' },
  { value: 'Month', label: 'Month' },
  { value: 'Hour', label: 'Hour' },
];

/**
 * The Offer tab. The team builds the terms step by step (saved to the server on every step),
 * approvers sign off, the recruiter sends it, then records the candidate's answer. Accepting is
 * what hires.
 */
export function ApplicationOffer({ id }: { id: string }) {
  const application = useApplication(id);
  const offer = useOffer(id);
  const invalidate = useInvalidateApprovals();
  const start = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/api/applications/${id}/offer`, {}),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error('Could not start the offer', error.message),
  });

  if (application.isError)
    return <LoadError error={application.error} onRetry={application.refetch} />;
  if (offer.isError) {
    // 404: not on the hiring team and not an approver.
    if (offer.error instanceof ApiError && offer.error.status === 404)
      return (
        <Card>
          <EmptyState
            icon={FileSignature}
            title="You cannot see this offer"
            description="Only the hiring team and the approvers can see it."
          />
        </Card>
      );
    return <LoadError error={offer.error} onRetry={offer.refetch} />;
  }
  if (!application.data || !offer.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );

  const { canManage } = application.data;
  const detail = application.data.application;
  const firstName = detail.candidateName.split(' ')[0];
  const current = offer.data.offer;
  const live = liveOffer(offer.data);
  const canStart = canManage && detail.status === 'Active' && !live;

  return (
    <div className="space-y-5">
      {live && live.status !== 'Draft' && (
        <Card className="overflow-x-auto px-5 py-4">
          <Steps steps={OFFER_STEPS} current={offerStep(live.status)} />
        </Card>
      )}
      {live?.status === 'Draft' && canManage ? (
        <OfferWizard
          key={live.id}
          applicationId={id}
          firstName={firstName}
          offer={live}
          data={offer.data}
        />
      ) : live ? (
        <OfferPanel
          applicationId={id}
          requisitionId={detail.requisitionId}
          firstName={firstName}
          doNotContact={Boolean(detail.candidateDoNotContact)}
          offer={live}
          data={offer.data}
          canManage={canManage}
          onRevise={canManage && detail.status === 'Active' ? () => start.mutate() : undefined}
        />
      ) : (
        <Card>
          <EmptyState
            icon={FileSignature}
            title={
              current?.status === 'Declined'
                ? `${firstName} declined the offer`
                : current?.status === 'Withdrawn'
                  ? 'The offer was withdrawn'
                  : 'No offer yet'
            }
            description={
              current?.status === 'Declined'
                ? `${declineText(current)}You can revise the terms and try again.`
                : detail.status !== 'Active'
                  ? `An offer can only be made while the application is active. This one is ${detail.status.toLowerCase()}.`
                  : canStart
                    ? 'Start with the terms. Approvers sign off before anything goes to the candidate.'
                    : 'The recruiter starts the offer when the team is ready.'
            }
            action={
              canStart && (
                <Button
                  variant="secondary"
                  loading={start.isPending}
                  onClick={() => start.mutate()}
                >
                  {current ? 'Start a revised offer' : 'Start offer'}
                </Button>
              )
            }
          />
        </Card>
      )}
      <History
        offers={live ? offer.data.history : current ? [current, ...offer.data.history] : []}
      />
    </div>
  );
}

type Draft = {
  note: string;
  baseSalary: number | '';
  currency: string;
  payPeriod: string;
  bonus: string;
  equity: string;
  startDate: string;
  employmentType: string;
  workMode: string;
  location: string;
  expiresOn: string;
};

const toDraft = (offer: Offer): Draft => ({
  note: offer.note,
  baseSalary: offer.baseSalary ?? '',
  currency: offer.currency,
  payPeriod: offer.payPeriod,
  bonus: offer.bonus,
  equity: offer.equity,
  startDate: offer.startDate ?? '',
  employmentType: offer.employmentType,
  workMode: offer.workMode,
  location: offer.location,
  expiresOn: offer.expiresOn ?? '',
});

const toBody = (draft: Draft) => ({
  ...draft,
  baseSalary: draft.baseSalary === '' ? null : draft.baseSalary,
  startDate: draft.startDate || null,
  expiresOn: draft.expiresOn || null,
});

const asTerms = (draft: Draft) => ({
  ...draft,
  baseSalary: draft.baseSalary === '' ? null : draft.baseSalary,
});

function TermsList({ terms, empty }: { terms: Parameters<typeof termRows>[0]; empty?: string }) {
  const rows = termRows(terms);
  if (rows.length === 0)
    return <p className="text-sm text-fg-subtle">{empty ?? 'No terms yet.'}</p>;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs text-fg-subtle">{row.label}</dt>
          <dd className="mt-0.5 break-words text-base text-fg">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OfferWizard({
  applicationId,
  firstName,
  offer,
  data,
}: {
  applicationId: string;
  firstName: string;
  offer: Offer;
  data: OfferResponse;
}) {
  const invalidate = useInvalidateApprovals();
  const directory = useDirectoryUsers();
  const [draft, setDraft] = useState<Draft>(() => toDraft(offer));
  const [saved, setSaved] = useState(() => JSON.stringify(toDraft(offer)));
  const [step, setStep] = useState(0);
  const [approvers, setApprovers] = useState<string[]>(data.defaultApprovers);
  const [sequential, setSequential] = useState(data.sequential);
  const [withdrawing, setWithdrawing] = useState(false);
  const [letter, setLetter] = useState<LetterDraft>({
    markdown: offer.letterMarkdown ?? '',
    templateId: offer.letterTemplateId ?? null,
  });
  const [savedLetter, setSavedLetter] = useState(() => JSON.stringify(letter));
  const set = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const rejected = data.approvals.filter((item) => item.decision === 'Rejected');

  const people = (directory.data ?? []).map((person) => ({
    value: person.email,
    label: `${person.displayName} · ${person.email}`,
  }));
  for (const email of approvers)
    if (!people.some((item) => item.value === email)) people.push({ value: email, label: email });
  const nameOf = (email: string) =>
    directory.data?.find((person) => person.email === email)?.displayName ?? email;

  // Saved on every step, so the terms are the same on any device.
  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify(draft);
      if (body !== saved) {
        await api.put(`/api/offers/${offer.id}`, toBody(draft));
        setSaved(body);
      }
      const letterBody = JSON.stringify(letter);
      if (letterBody !== savedLetter && letter.markdown.trim()) {
        await api.put(`/api/offers/${offer.id}/letter`, letter);
        setSavedLetter(letterBody);
      }
    },
    onError: (error: Error) => toast.error('Could not save the offer', error.message),
  });
  const submit = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      await api.post(`/api/offers/${offer.id}/submit`, { approvers, sequential });
    },
    onSuccess: () =>
      toast.success(
        approvers.length
          ? 'Sent for approval. Approvers have been emailed.'
          : 'Ready to send. No approval was needed.',
      ),
    onError: (error: Error) => toast.error('Could not submit the offer', error.message),
    onSettled: invalidate,
  });
  const withdraw = useMutation({
    mutationFn: () => api.post(`/api/offers/${offer.id}/withdraw`),
    onSuccess: () => {
      invalidate();
      toast.success('Draft offer withdrawn');
    },
    onError: (error: Error) => toast.error('Could not withdraw the offer', error.message),
  });

  const currencies = useSupportedCurrencyCodes();
  const salaryOk = draft.baseSalary !== '' && draft.baseSalary > 0;
  const datesOk = !draft.expiresOn || !draft.startDate || draft.expiresOn <= draft.startDate;
  const steps = [
    { id: 'pay', title: 'Pay', description: 'Salary, bonus and equity.', valid: salaryOk },
    {
      id: 'terms',
      title: 'Terms',
      description: 'Start date and how they will work.',
      valid: Boolean(draft.startDate) && datesOk,
    },
    {
      id: 'letter',
      title: 'Letter',
      description: 'What the candidate reads.',
      valid: letter.markdown.trim().length > 0,
    },
    {
      id: 'approvers',
      title: 'Approvers',
      description: 'Who signs off before it goes out.',
      valid: !data.approvalRequired || approvers.length > 0,
    },
    { id: 'review', title: 'Review and submit' },
  ];

  return (
    <>
      {rejected.map((item) => (
        <Alert key={item.id} tone="danger" title={`${item.approverName} rejected this offer`}>
          <p className="whitespace-pre-wrap">{item.comment}</p>
          <p className="mt-1">Change what they raised, then submit again.</p>
        </Alert>
      ))}
      <Wizard
        steps={steps}
        current={step}
        onStepChange={(next) => {
          save.mutate();
          setStep(next);
        }}
        onFinish={() => submit.mutate()}
        finishLabel={approvers.length ? 'Submit for approval' : 'Mark ready to send'}
        busy={submit.isPending}
        aside={
          step === 2 || step === 4 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg-muted">
                {save.isPending ? 'Saving…' : `What ${firstName} will read`}
              </p>
              <LetterPreview offerId={offer.id} markdown={letter.markdown} />
            </div>
          ) : (
            <Card>
              <CardHeader
                title="Summary"
                description={save.isPending ? 'Saving…' : 'Saved as a draft'}
              />
              <CardBody>
                <TermsList
                  terms={asTerms(draft)}
                  empty="The terms show here as you fill them in."
                />
              </CardBody>
            </Card>
          )
        }
      >
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Base salary"
              required
              min={0}
              value={draft.baseSalary}
              onValueChange={(value) => set({ baseSalary: value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <SearchSelect
                label="Currency"
                value={draft.currency}
                onChange={(value) => value && set({ currency: value })}
                data={currencies.options}
              />
              <Select
                label="Paid per"
                value={draft.payPeriod}
                onChange={(value) => value && set({ payPeriod: value })}
                data={PAY_PERIODS}
              />
            </div>
            <Input
              label="Bonus"
              description="Optional. For example, 10% yearly target."
              value={draft.bonus}
              onChange={(event) => set({ bonus: event.currentTarget.value })}
            />
            <Input
              label="Equity"
              description="Optional. For example, 2,000 stock options over 4 years."
              value={draft.equity}
              onChange={(event) => set({ equity: event.currentTarget.value })}
            />
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="date"
              label="Start date"
              required
              value={draft.startDate}
              onChange={(event) => set({ startDate: event.currentTarget.value })}
            />
            <Input
              type="date"
              label="Offer open until"
              description="Optional. The last day they can accept."
              error={datesOk ? undefined : 'Pick a day before the start date.'}
              value={draft.expiresOn}
              onChange={(event) => set({ expiresOn: event.currentTarget.value })}
            />
            <Input
              label="Employment type"
              description="Filled in from the job."
              value={draft.employmentType}
              onChange={(event) => set({ employmentType: event.currentTarget.value })}
            />
            <Input
              label="Work mode"
              description="For example, Hybrid."
              value={draft.workMode}
              onChange={(event) => set({ workMode: event.currentTarget.value })}
            />
            <Input
              label="Location"
              className="sm:col-span-2"
              value={draft.location}
              onChange={(event) => set({ location: event.currentTarget.value })}
            />
          </div>
        )}
        {step === 2 && <LetterEditor value={letter} onChange={setLetter} />}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <MultiSelect
              label="Who needs to approve"
              description={
                data.approvalRequired
                  ? 'At least one person other than you.'
                  : 'Optional. Leave it empty to skip approval.'
              }
              placeholder="Search by name"
              data={people}
              value={approvers}
              onChange={setApprovers}
              nothingFound="No one matches that name"
            />
            {approvers.length > 1 && (
              <Switch
                label="Ask one at a time"
                description="Each person is asked only after the one before has approved."
                checked={sequential}
                onCheckedChange={setSequential}
              />
            )}
            <Textarea
              label="Note for approvers"
              description="Optional. For example, why this person and how the pay was set."
              minRows={4}
              value={draft.note}
              onChange={(event) => set({ note: event.currentTarget.value })}
            />
          </div>
        )}
        {step === 4 && (
          <div className="space-y-5">
            <TermsList terms={asTerms(draft)} />
            {draft.note.trim() && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-xs font-medium text-fg-subtle">Your note for approvers</p>
                <p className="mt-1 whitespace-pre-wrap text-base text-fg">{draft.note}</p>
              </div>
            )}
            <p className="text-sm text-fg-muted">
              {approvers.length
                ? `Approvers, ${sequential && approvers.length > 1 ? 'one at a time' : 'all at once'}: ${approvers.map(nameOf).join(', ')}.`
                : 'No approval needed. You can send it straight away.'}
            </p>
            <Alert tone="info" title={`Nothing goes to ${firstName} yet`}>
              After approval, you send it from this page. {firstName} gets an email with a link to
              the letter, and accepts or declines in their portal. Accepting is what marks them
              hired.
            </Alert>
          </div>
        )}
      </Wizard>
      <PreviousRounds rounds={data.previousRounds} />
      <div className="flex justify-end">
        <Button variant="danger-quiet" size="sm" onClick={() => setWithdrawing(true)}>
          Withdraw draft
        </Button>
      </div>
      <ConfirmDialog
        opened={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this offer?"
        confirmLabel="Withdraw offer"
        message="Nothing has been sent to the candidate. You can start a new offer later."
        onConfirm={() =>
          withdraw.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </>
  );
}

type Confirm = 'send' | 'accept' | 'decline' | 'withdraw' | 'reverse' | 'edit' | 'letter';

/** "Their reason: Accepted another offer. They start at another company in March. " */
const declineText = (offer: Offer) =>
  offer.declineReasonLabel
    ? `Their reason: ${offer.declineReasonLabel}${offer.declineNote ? `. ${offer.declineNote}` : ''}. `
    : '';

function OfferPanel({
  applicationId,
  requisitionId,
  firstName,
  doNotContact,
  offer,
  data,
  canManage,
  onRevise,
}: {
  applicationId: string;
  requisitionId: string;
  firstName: string;
  doNotContact: boolean;
  offer: Offer;
  data: OfferResponse;
  canManage: boolean;
  /** Starts a revised offer (after it expired). */
  onRevise?: () => void;
}) {
  const invalidateApprovals = useInvalidateApprovals();
  const invalidateApplication = useInvalidateApplication(applicationId);
  const invalidate = () => {
    invalidateApprovals();
    invalidateApplication();
  };
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notify, setNotify] = useState(!doNotContact);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [letter, setLetter] = useState<LetterDraft>({
    markdown: offer.letterMarkdown ?? '',
    templateId: offer.letterTemplateId ?? null,
  });
  const [filled, setFilled] = useState<{ stillActive: number } | null>(null);
  const mine = data.approvals.find((item) => item.canDecide);
  const pending = data.approvals.filter((item) => item.decision === 'Pending');
  const turn = pending.length ? Math.min(...pending.map((item) => item.sequence)) : null;
  const waiting = pending.filter((item) => item.sequence === turn);

  const act = useMutation({
    mutationFn: async (action: Confirm) => {
      if (action === 'send')
        return api.post(`/api/offers/${offer.id}/send`, { notifyCandidate: notify });
      if (action === 'accept' || action === 'decline')
        return api.post<{ jobFilled: boolean; stillActive: number }>(
          `/api/offers/${offer.id}/response`,
          {
            accepted: action === 'accept',
            declineReason,
            declineNote: declineNote.trim() || null,
          },
        );
      if (action === 'edit') return api.put(`/api/offers/${offer.id}`, toBody(toDraft(offer)));
      if (action === 'letter') return api.put(`/api/offers/${offer.id}/letter`, letter);
      return api.post(`/api/offers/${offer.id}/${action}`);
    },
    onSuccess: (result, action) => {
      invalidate();
      setConfirm(null);
      const response = result as { jobFilled?: boolean; stillActive?: number } | undefined;
      if (action === 'accept' && response?.jobFilled && response.stillActive)
        setFilled({ stillActive: response.stillActive });
      toast.success(
        {
          send: notify ? `Offer sent. ${firstName} has been emailed.` : 'Offer marked as sent.',
          accept: `${firstName} accepted and is now hired.`,
          decline: 'Recorded that the offer was declined.',
          withdraw: 'Offer withdrawn.',
          reverse: 'Hire undone. The application is back where it was.',
          edit: 'The offer is a draft again. Change the terms, then submit it.',
          letter: 'Letter saved',
        }[action],
      );
    },
    onError: (error: Error) => {
      setConfirm(null);
      toast.error('That did not work', error.message);
    },
  });
  const remind = useMutation({
    mutationFn: (approvalId: string) => api.post(`/api/approvals/${approvalId}/remind`),
    onSuccess: () => toast.success('Reminder sent'),
    onError: (error: Error) => toast.error('Could not send the reminder', error.message),
  });
  const run = (action: Confirm) => () =>
    act.mutateAsync(action).then(
      () => undefined,
      () => undefined,
    );

  const closes = offer.expiresAt
    ? formatDateTime(new Date(new Date(offer.expiresAt).getTime() - 60_000).toISOString())
    : null;
  const description = {
    Draft: 'The recruiter is still preparing this.',
    PendingApproval: 'Waiting for approval. Nothing has been sent to the candidate.',
    Approved: `Everyone approved. You can send it to ${firstName}.`,
    Sent: `Sent ${offer.sentAt ? formatDate(offer.sentAt) : ''}. ${firstName} can accept or decline in their portal${closes ? ` until ${closes}` : ''}.`,
    Accepted: offer.respondedName
      ? `${firstName} accepted in their portal${offer.respondedAt ? ` on ${formatDate(offer.respondedAt)}` : ''}, typing “${offer.respondedName}”, and is hired.`
      : `${offer.respondedByName ?? 'The team'} recorded that ${firstName} accepted${offer.respondedAt ? ` on ${formatDate(offer.respondedAt)}` : ''}. They are hired.`,
    Declined: '',
    Withdrawn: '',
    Expired: `It closed${closes ? ` on ${closes}` : ''} without an answer. If ${firstName} answered another way, record it. Or start a revised offer.`,
  }[offer.status];
  const sent = ['Sent', 'Accepted', 'Expired'].includes(offer.status);
  const hasApprovals = data.approvals.length > 0 || data.previousRounds.length > 0;

  return (
    <>
      {filled && (
        <Alert
          tone="success"
          title={`The job is filled. ${filled.stillActive} ${filled.stillActive === 1 ? 'applicant is' : 'applicants are'} still active.`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={`/jobs/${requisitionId}/candidates`}>Review them</Link>
            </Button>
          }
          onDismiss={() => setFilled(null)}
        >
          Let them know the position is closed, so nobody waits for an answer.
        </Alert>
      )}
      <div
        className={cn(
          'grid items-start gap-5',
          hasApprovals && 'lg:grid-cols-[minmax(0,1fr)_360px]',
        )}
      >
        <Card>
          <CardHeader
            title="Offer"
            description={description}
            action={<StatusBadge status={offer.status} />}
          />
          <CardBody className="space-y-5">
            {/* Offers from before structured terms carry them in the note only. */}
            {termRows(offer).length > 0 && <TermsList terms={offer} />}
            {offer.note && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-xs font-medium text-fg-subtle">
                  Note from {offer.createdByName}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-base text-fg">{offer.note}</p>
              </div>
            )}
            {offer.status === 'PendingApproval' && mine && (
              <DecideControls approvalId={mine.id} subject={`the offer for ${firstName}`} />
            )}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
                {offer.status === 'Approved' && (
                  <Button leftIcon={<Send />} onClick={() => setConfirm('send')}>
                    Send offer
                  </Button>
                )}
                {(offer.status === 'Sent' || offer.status === 'Expired') && (
                  <>
                    {offer.status === 'Expired' && onRevise && (
                      <Button leftIcon={<RotateCcw />} onClick={onRevise}>
                        Start a revised offer
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      leftIcon={<Check />}
                      onClick={() => setConfirm('accept')}
                    >
                      Mark as accepted
                    </Button>
                    <Button
                      variant="secondary"
                      leftIcon={<X />}
                      onClick={() => setConfirm('decline')}
                    >
                      Mark as declined
                    </Button>
                  </>
                )}
                {(offer.status === 'PendingApproval' || offer.status === 'Approved') && (
                  <Button
                    variant="secondary"
                    leftIcon={<Pencil />}
                    onClick={() => setConfirm('edit')}
                  >
                    Change terms
                  </Button>
                )}
                {offer.status === 'Accepted' && (
                  <Button
                    variant="quiet"
                    size="sm"
                    leftIcon={<RotateCcw />}
                    onClick={() => setConfirm('reverse')}
                  >
                    Undo hire
                  </Button>
                )}
                {!['Accepted', 'Expired'].includes(offer.status) && (
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setConfirm('withdraw')}
                  >
                    Withdraw offer
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>
        {hasApprovals && (
          <Card className="lg:col-start-2 lg:row-start-1">
            <CardHeader title="Approvals" />
            <CardBody className="space-y-4">
              {data.approvals.length > 0 && <ApprovalTimeline approvals={data.approvals} />}
              {canManage && offer.status === 'PendingApproval' && waiting.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                  {waiting.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      variant="secondary"
                      loading={remind.isPending && remind.variables === item.id}
                      onClick={() => remind.mutate(item.id)}
                    >
                      Remind {item.approverName.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              )}
              <PreviousRounds rounds={data.previousRounds} />
            </CardBody>
          </Card>
        )}
        {(offer.letterSent || offer.letterMarkdown) && (
          <section className="min-w-0 space-y-3" aria-label="Offer letter">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  {sent ? 'The letter as sent' : 'Offer letter'}
                </h2>
                {offer.letterTemplateId && (
                  <p className="text-sm text-fg-muted">
                    Started from{' '}
                    {offer.letterTemplateName
                      ? `“${offer.letterTemplateName}”`
                      : 'a deleted letter'}
                    {offer.letterTemplateVersion ? `, version ${offer.letterTemplateVersion}` : ''}.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && !sent && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Pencil />}
                    onClick={() => setConfirm('letter')}
                  >
                    Edit letter
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Download />}
                  onClick={() => window.print()}
                >
                  Download PDF
                </Button>
              </div>
            </div>
            {offer.letterSent ? (
              <LetterPaper markdown={offer.letterSent} />
            ) : (
              <LetterPreview offerId={offer.id} />
            )}
          </section>
        )}
      </div>

      <Drawer
        opened={confirm === 'letter'}
        onClose={() => setConfirm(null)}
        title="Edit the letter"
        description="Approvers are not asked again: the terms they approved fill the details."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              loading={act.isPending}
              disabled={!letter.markdown.trim()}
              onClick={() => act.mutate('letter')}
            >
              Save letter
            </Button>
          </>
        }
      >
        <LetterEditor value={letter} onChange={setLetter} />
      </Drawer>

      <Modal
        opened={confirm === 'send'}
        onClose={() => setConfirm(null)}
        title={`Send the offer to ${firstName}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button loading={act.isPending} onClick={() => act.mutate('send')}>
              {notify ? 'Send email' : 'Mark as sent'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-base text-fg-muted">
          <Switch
            label={`Email ${firstName}`}
            description={
              doNotContact
                ? `${firstName} asked not to be contacted.`
                : 'With a link that signs them in to the offer page, where they read the letter and answer.'
            }
            checked={notify}
            disabled={doNotContact}
            onCheckedChange={setNotify}
          />
          <p>
            The letter is saved as it is now and does not change after this. Sending does not hire
            anyone: accepting does, in their portal or when you record it here.
          </p>
        </div>
      </Modal>
      <ConfirmDialog
        opened={confirm === 'accept'}
        onClose={() => setConfirm(null)}
        title={`${firstName} accepted the offer?`}
        confirmLabel="Mark as accepted"
        confirmVariant="primary"
        message="The application moves to Hired. If the job has no openings left, it is marked filled."
        onConfirm={run('accept')}
      />
      <Modal
        opened={confirm === 'decline'}
        onClose={() => setConfirm(null)}
        title={`${firstName} declined the offer?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              disabled={!declineReason}
              onClick={() => act.mutate('decline')}
            >
              Mark as declined
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Their main reason"
            placeholder="Choose a reason"
            value={declineReason}
            onChange={setDeclineReason}
            data={data.declineReasons.map((r) => ({ value: r.key, label: r.label }))}
          />
          <Textarea
            label="Note"
            description="Optional. For example, what would have changed their mind."
            minRows={3}
            value={declineNote}
            onChange={(event) => setDeclineNote(event.currentTarget.value)}
          />
        </div>
      </Modal>
      <ConfirmDialog
        opened={confirm === 'edit'}
        onClose={() => setConfirm(null)}
        title="Change the terms?"
        confirmLabel="Change terms"
        confirmVariant="primary"
        message="The offer goes back to draft. Approvers are asked again after you submit it."
        onConfirm={run('edit')}
      />
      <ConfirmDialog
        opened={confirm === 'reverse'}
        onClose={() => setConfirm(null)}
        title="Undo this hire?"
        confirmLabel="Undo hire"
        message={`Use this if the hire falls through. The application goes back to its earlier stage and the offer back to Sent. ${firstName} is not emailed.`}
        onConfirm={run('reverse')}
      />
      <ConfirmDialog
        opened={confirm === 'withdraw'}
        onClose={() => setConfirm(null)}
        title="Withdraw this offer?"
        confirmLabel="Withdraw offer"
        message={
          offer.status === 'Sent'
            ? `${firstName} already has it, so tell them yourself. Approvals are dropped, and you can start a new offer later.`
            : 'Nothing has been sent to the candidate. Approvals are dropped, and you can start a new offer later.'
        }
        onConfirm={run('withdraw')}
      />
    </>
  );
}

/** Earlier offers stay readable after a decline or a withdrawal. */
function History({ offers }: { offers: Offer[] }) {
  if (offers.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Earlier offers" />
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {offers.map((item) => (
          <li key={item.id} className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg-muted">
                Started by {item.createdByName} on {formatDateTime(item.createdAt)}
                {item.declineReasonLabel ? ` · ${declineText(item).trim()}` : ''}
              </p>
              <StatusBadge status={item.status} />
            </div>
            <TermsList terms={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
