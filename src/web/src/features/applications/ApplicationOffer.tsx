'use client';

import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  MultiSelect,
  NumberInput,
  Select,
  SkeletonRows,
  Steps,
  Switch,
  Textarea,
  Wizard,
  toast,
} from '@/components/ui';
import { useDirectoryUsers, useInvalidateApprovals } from '@/features/approvals/approval-data';
import { useLocalStorageState } from '@/lib/hooks';
import { canManageRole, LoadError, useApplication } from './application-data';
import { composeOfferNote, emptyOfferTerms, type OfferTerms } from './offer-note';
import { OfferPanel, useOffer } from './OfferPanel';

type OfferData = NonNullable<ReturnType<typeof useOffer>['data']>;
type LiveOffer = NonNullable<OfferData['offer']>;

const PROGRESS = ['Draft', 'Approval', 'Approved', 'Sent'];
const progressIndex = { Draft: 0, PendingApproval: 1, Approved: 2, Sent: 4, Withdrawn: 0 } as const;

/**
 * The Offer tab. With no open offer (or a draft) the hiring team builds one step by step; once it
 * is submitted this page shows where it stands, the approval chain, and the send / withdraw /
 * reverse actions (the same panel the overview shows).
 */
export function ApplicationOffer({ id }: { id: string }) {
  const user = useCurrentUser();
  const canManage = canManageRole(user.role);
  const application = useApplication(id);
  const offer = useOffer(id);

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

  const detail = application.data.application;
  const live =
    offer.data.offer && offer.data.offer.status !== 'Withdrawn' ? offer.data.offer : null;
  const building = canManage && detail.status === 'Active' && (!live || live.status === 'Draft');

  return (
    <div className="space-y-5">
      {live && (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Steps steps={PROGRESS} current={progressIndex[live.status]} />
        </Card>
      )}
      {building ? (
        <OfferWizard
          applicationId={id}
          candidateName={detail.candidateName}
          data={offer.data}
          live={live}
        />
      ) : live ? (
        <OfferPanel
          applicationId={id}
          applicationStatus={detail.status}
          candidateName={detail.candidateName}
          canManage={canManage}
        />
      ) : (
        <Card>
          <EmptyState
            icon={FileSignature}
            title="No offer yet"
            description={
              detail.status === 'Active'
                ? 'The recruiter starts the offer when the team is ready.'
                : `An offer can only be made while the application is active. This one is ${detail.status.toLowerCase()}.`
            }
          />
        </Card>
      )}
    </div>
  );
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'NPR'];

function OfferWizard({
  applicationId,
  candidateName,
  data,
  live,
}: {
  applicationId: string;
  candidateName: string;
  data: OfferData;
  live: LiveOffer | null;
}) {
  const invalidate = useInvalidateApprovals();
  const directory = useDirectoryUsers();
  // Kept per application on this device, so a rejected offer comes back with its terms intact.
  // From another device, an existing draft's note lands in the free text so nothing is lost.
  const [terms, setTerms] = useLocalStorageState<OfferTerms>(
    `offer-draft:${applicationId}`,
    live?.note
      ? { ...emptyOfferTerms(), employmentType: '', workMode: '', notes: live.note }
      : emptyOfferTerms(),
  );
  const [step, setStep] = useState(0);
  const [approvers, setApprovers] = useState<string[]>(data.defaultApprovers);
  const [sequential, setSequential] = useState(data.sequential);
  const [withdrawing, setWithdrawing] = useState(false);
  const set = (next: Partial<OfferTerms>) => setTerms((current) => ({ ...current, ...next }));
  const note = composeOfferNote(terms);
  const rejected = data.approvals.filter((item) => item.decision === 'Rejected');

  const people = (directory.data ?? []).map((person) => ({
    value: person.email,
    label: `${person.displayName} · ${person.email}`,
  }));
  for (const email of approvers)
    if (!people.some((item) => item.value === email)) people.push({ value: email, label: email });

  const submit = useMutation({
    mutationFn: async () => {
      let offerId = live?.id;
      if (offerId) await api.put(`/api/offers/${offerId}`, { note });
      else
        offerId = (
          await api.post<{ id: string }>(`/api/applications/${applicationId}/offer`, { note })
        ).id;
      await api.post(`/api/offers/${offerId}/submit`, { approvers, sequential });
    },
    onSuccess: () =>
      toast.success(
        approvers.length
          ? 'Sent for approval. Approvers have been emailed.'
          : 'Ready to send. No approval was needed.',
      ),
    onError: (error: Error) => toast.error('Could not submit the offer', error.message),
    // A created draft must show up even if the submit after it failed.
    onSettled: invalidate,
  });
  const withdraw = useMutation({
    mutationFn: (offerId: string) => api.post(`/api/offers/${offerId}/withdraw`),
    onSuccess: () => {
      invalidate();
      setWithdrawing(false);
      toast.success('Draft offer withdrawn.');
    },
    onError: (error: Error) => {
      setWithdrawing(false);
      toast.error('Could not withdraw the offer', error.message);
    },
  });

  const steps = [
    {
      id: 'compensation',
      title: 'Compensation',
      description: 'Pay, bonus and equity.',
      valid: terms.baseSalary !== '' && terms.baseSalary > 0,
    },
    {
      id: 'terms',
      title: 'Terms',
      description: 'Start date and how they will work.',
      valid: Boolean(terms.startDate),
    },
    {
      id: 'approvers',
      title: 'Approvers',
      description: 'Who approves it before it goes out.',
      valid: !data.approvalRequired || approvers.length > 0,
    },
    { id: 'review', title: 'Review and submit' },
  ];

  const preview = (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs font-medium text-fg-subtle">What approvers will read</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">
        {note || 'Nothing yet.'}
      </p>
    </div>
  );

  return (
    <>
      {rejected.map((item) => (
        <Alert key={item.id} tone="danger" title={`${item.approverName} rejected this`}>
          <p className="whitespace-pre-wrap">{item.comment}</p>
          <p className="mt-1">Fix what they raised, then submit again.</p>
        </Alert>
      ))}
      <Wizard
        steps={steps}
        current={step}
        onStepChange={setStep}
        onFinish={() => submit.mutate()}
        finishLabel={approvers.length ? 'Submit for approval' : 'Mark ready to send'}
        busy={submit.isPending}
        aside={
          <Card>
            <CardHeader title="Preview" description={`Offer for ${candidateName}`} />
            <CardBody>{preview}</CardBody>
          </Card>
        }
      >
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="Base salary"
              required
              min={0}
              value={terms.baseSalary}
              onValueChange={(value) => set({ baseSalary: value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Currency"
                value={terms.currency}
                onChange={(value) => value && set({ currency: value })}
                data={CURRENCIES}
              />
              <Select
                label="Paid per"
                value={terms.payPeriod}
                onChange={(value) => value && set({ payPeriod: value as OfferTerms['payPeriod'] })}
                data={[
                  { value: 'year', label: 'Year' },
                  { value: 'month', label: 'Month' },
                  { value: 'hour', label: 'Hour' },
                ]}
              />
            </div>
            <Input
              label="Bonus"
              description="Optional. For example, 10% yearly target."
              value={terms.bonus}
              onChange={(event) => set({ bonus: event.currentTarget.value })}
            />
            <Input
              label="Equity"
              description="Optional. For example, 2,000 stock options over 4 years."
              value={terms.equity}
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
              value={terms.startDate}
              onChange={(event) => set({ startDate: event.currentTarget.value })}
            />
            <Input
              type="date"
              label="Offer valid until"
              description="Optional."
              value={terms.validUntil}
              onChange={(event) => set({ validUntil: event.currentTarget.value })}
            />
            <Select
              label="Employment type"
              value={terms.employmentType || null}
              onChange={(value) => set({ employmentType: value ?? '' })}
              data={['Full-time', 'Part-time', 'Contract', 'Internship']}
            />
            <Select
              label="Work mode"
              value={terms.workMode || null}
              onChange={(value) => set({ workMode: value ?? '' })}
              data={['On-site', 'Hybrid', 'Remote']}
            />
            <Input
              label="Location"
              className="sm:col-span-2"
              value={terms.location}
              onChange={(event) => set({ location: event.currentTarget.value })}
            />
            <Textarea
              label="Anything else for approvers"
              description="For example, why you chose this person."
              className="sm:col-span-2"
              minRows={4}
              value={terms.notes}
              onChange={(event) => set({ notes: event.currentTarget.value })}
            />
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <MultiSelect
              label="Who needs to approve"
              description={
                data.approvalRequired
                  ? 'At least one person.'
                  : 'Optional. Leave empty to skip approval.'
              }
              placeholder="Search by name"
              data={people}
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
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            {preview}
            <p className="text-sm text-fg-muted">
              {approvers.length
                ? `Approvers (${sequential && approvers.length > 1 ? 'one after another' : 'all at once'}): ${approvers.join(', ')}.`
                : 'No approval needed. The offer is ready to send straight away.'}
            </p>
            <Alert tone="info" title={`Nothing goes to ${candidateName} yet`}>
              After it is approved, you send the acceptance email from this page. These terms are
              only for approvers. The candidate gets the standard acceptance email.
            </Alert>
          </div>
        )}
      </Wizard>
      {live && (
        <div>
          <Button variant="quiet" size="xs" onClick={() => setWithdrawing(true)}>
            Withdraw this draft
          </Button>
          <ConfirmDialog
            opened={withdrawing}
            onClose={() => setWithdrawing(false)}
            title="Withdraw this offer?"
            confirmLabel="Withdraw offer"
            message="Nothing has been sent to the candidate. Any approvals so far are dropped, and you can start a new offer later."
            onConfirm={() =>
              withdraw.mutateAsync(live.id).then(
                () => undefined,
                () => undefined,
              )
            }
          />
        </div>
      )}
    </>
  );
}
