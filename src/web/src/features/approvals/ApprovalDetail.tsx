'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, ConfirmDialog, DescriptionList, Drawer } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  MODE_LABEL,
  OUTCOME_LABEL,
  useWithdrawApproval,
  waitedText,
  type ApprovalItem,
  type ApprovalScope,
  type JobSubject,
  type OfferSubject,
} from './approval-data';
import { ApprovalTimeline, DecideControls, PreviousRounds, outcomeTone } from './ApprovalParts';

export const TYPE_LABEL: Record<ApprovalItem['type'], string> = {
  Offer: 'Offer',
  Requisition: 'New job',
  WorkflowRun: 'Workflow step',
};

export function subjectHref(item: ApprovalItem) {
  return item.applicationId
    ? `/applications/${item.applicationId}${item.type === 'Offer' ? '/offer' : ''}`
    : item.requisitionId
      ? `/jobs/${item.requisitionId}`
      : null;
}

export function OpenSubjectLink({ item }: { item: ApprovalItem }) {
  const href = subjectHref(item);
  if (!href) return null;
  return (
    <Button asChild variant="quiet">
      <Link href={href}>{item.applicationId ? 'Open application' : 'Open job'}</Link>
    </Button>
  );
}

// Offers and workflow steps are about a candidate, so they share the candidate summary.
const isOffer = (item: ApprovalItem): item is ApprovalItem & { subject: OfferSubject } =>
  item.type !== 'Requisition';

/** The one line under a row's title: what is being approved, in short. */
export function SubjectLine({ item }: { item: ApprovalItem }) {
  if (isOffer(item)) {
    const pay = item.subject.terms.find((line) => line.startsWith('Base salary'));
    return (
      <p className="mt-0.5 text-sm text-fg-muted">
        {[item.detail, pay?.replace('Base salary: ', '')].filter(Boolean).join(' · ')}
      </p>
    );
  }
  const job = item.subject as JobSubject;
  return (
    <p className="mt-0.5 text-sm text-fg-muted">
      {[item.detail, job.location, job.salary].filter(Boolean).join(' · ')}
    </p>
  );
}

function JobSummary({ job }: { job: JobSubject }) {
  return (
    <div className="flex flex-col gap-4">
      <DescriptionList
        columns={2}
        items={[
          { label: 'Team', value: job.department },
          { label: 'Location', value: `${job.location} · ${job.workMode}` },
          { label: 'Employment type', value: job.employmentType },
          {
            label: 'Openings',
            value: job.openings,
          },
          { label: 'Hiring manager', value: job.hiringManager ?? 'Not set' },
          { label: 'Pay', value: job.salary ?? 'Not set' },
          ...(job.targetStartDate
            ? [{ label: 'Target start', value: formatDate(job.targetStartDate) }]
            : []),
        ]}
      />
      {job.summary && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg-subtle">From the posting</p>
          <p className="text-sm whitespace-pre-wrap text-fg-muted">{job.summary}</p>
        </div>
      )}
    </div>
  );
}

function OfferSummary({ offer }: { offer: OfferSubject }) {
  const { yes, no, total } = offer.scorecards;
  return (
    <div className="flex flex-col gap-4">
      <DescriptionList
        columns={2}
        items={[
          {
            label: 'Candidate',
            value: offer.currentTitle
              ? `${offer.candidateName}, ${offer.currentTitle}`
              : offer.candidateName,
          },
          { label: 'Job', value: `${offer.jobTitle} (${offer.jobCode})` },
          { label: 'Stage', value: offer.stage ?? 'Not set' },
          { label: 'Applied', value: formatDate(offer.appliedAt) },
          {
            label: 'Scorecards',
            value: total ? `${yes} yes, ${no} no, ${total - yes - no} mixed` : 'None submitted yet',
          },
        ]}
      />
      {offer.terms.length > 0 && (
        <div className="rounded-lg bg-muted px-4 py-3">
          <p className="mb-1 text-xs font-medium text-fg-subtle">Terms</p>
          <ul className="space-y-0.5 text-sm text-fg">
            {offer.terms.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {offer.note && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg-subtle">Why this person</p>
          <p className="text-sm whitespace-pre-wrap text-fg-muted">{offer.note}</p>
        </div>
      )}
    </div>
  );
}

/** Side panel for one request: what is being approved, every approver in order, and earlier rounds. */
export function ApprovalDetailDrawer({
  item,
  scope,
  onClose,
}: {
  item: ApprovalItem | null;
  scope: ApprovalScope;
  onClose: () => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useWithdrawApproval(() => {
    setWithdrawing(false);
    onClose();
  });
  const pending = item?.status === 'Pending';
  return (
    <Drawer
      opened={item !== null}
      onClose={onClose}
      size="lg"
      title={item?.title ?? ''}
      description={item ? `${TYPE_LABEL[item.type]} · asked by ${item.requestedByName}` : undefined}
      footer={
        item && (
          <>
            <div className="mr-auto">
              <OpenSubjectLink item={item} />
            </div>
            {scope === 'requested' && pending && (
              <Button variant="danger-quiet" onClick={() => setWithdrawing(true)}>
                Withdraw request
              </Button>
            )}
            {item.canDecide && <DecideControls approvalId={item.id} subject={item.title} />}
          </>
        )
      }
    >
      {item && (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="approval-subject">
            <h3 id="approval-subject" className="sr-only">
              What is being approved
            </h3>
            {isOffer(item) ? (
              <OfferSummary offer={item.subject} />
            ) : (
              <JobSummary job={item.subject as JobSubject} />
            )}
          </section>

          {item.note && (
            <blockquote className="rounded-lg bg-muted px-3 py-2.5">
              <p className="text-xs text-fg-subtle">Note from {item.requestedByName}</p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg">{item.note}</p>
            </blockquote>
          )}

          <section aria-labelledby="approval-chain" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="approval-chain" className="text-md font-semibold text-fg">
                Approvers
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-subtle">{MODE_LABEL[item.mode]}</span>
                <Badge dot tone={outcomeTone[item.status]}>
                  {OUTCOME_LABEL[item.status]}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-fg-subtle">
              Asked {formatDateTime(item.createdAt)}
              {pending ? ` · waiting ${waitedText(item.waitingSince)}` : ''}
            </p>
            <ApprovalTimeline approvals={item.approvers} steer={scope === 'requested' && pending} />
            <PreviousRounds rounds={item.previousRounds} />
          </section>
        </div>
      )}
      <ConfirmDialog
        opened={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this request?"
        message="It goes back to draft and nobody is asked to approve it. You can send it again later."
        confirmLabel="Withdraw request"
        onConfirm={() =>
          item
            ? withdraw.mutateAsync({ subjectType: item.type, subjectId: item.subjectId }).then(
                () => undefined,
                () => undefined,
              )
            : undefined
        }
      />
    </Drawer>
  );
}
