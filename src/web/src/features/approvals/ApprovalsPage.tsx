'use client';

import { useState } from 'react';
import { Briefcase, CheckCheck, FileSignature, RotateCw } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconDisc,
  PageHeader,
  SkeletonRows,
  Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import {
  OUTCOME_LABEL,
  useApprovals,
  useWithdrawApproval,
  waitedText,
  type ApprovalItem,
  type ApprovalScope,
} from './approval-data';
import { DecideControls, outcomeTone } from './ApprovalParts';
import { ApprovalDetailDrawer, SubjectLine, TYPE_LABEL } from './ApprovalDetail';

const EMPTY: Record<ApprovalScope, { title: string; description: string }> = {
  waiting: {
    title: 'Nothing is waiting on you',
    description:
      'When someone asks you to approve a job or an offer, it shows up here and in the bell.',
  },
  requested: {
    title: 'You have not asked for any approvals',
    description: 'Submit a draft job or an offer for approval, and you can follow it here.',
  },
  done: {
    title: 'You have not answered any requests yet',
    description: 'Jobs and offers you approve or reject are kept here.',
  },
};

/** `openId`: an approval to open on arrival (approval emails link to `/approvals?open={id}`). */
export function ApprovalsPage({ openId: initialOpenId }: { openId?: string } = {}) {
  const lists = {
    waiting: useApprovals('waiting'),
    requested: useApprovals('requested'),
    done: useApprovals('done'),
  };
  const [tab, setTab] = useState<ApprovalScope>('waiting');
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const query = lists[tab];
  const items = query.data ?? [];
  // Found in whichever list has it, so an email link opens even after the decision.
  const open =
    (Object.keys(lists) as ApprovalScope[])
      .map((scope) => ({ scope, item: lists[scope].data?.find((i) => i.id === openId) }))
      .find((found) => found.item) ?? null;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Jobs and offers that need a sign-off. If you reject one, say why so the requester knows what to fix."
      />
      <Card className="px-5">
        <Tabs
          aria-label="Approvals"
          value={tab}
          onValueChange={(value) => setTab(value as ApprovalScope)}
          items={[
            { value: 'waiting', label: 'Waiting on me', count: lists.waiting.data?.length },
            {
              value: 'requested',
              label: 'Requested by me',
              count: lists.requested.data?.filter((i) => i.status === 'Pending').length,
            },
            { value: 'done', label: 'Done' },
          ]}
          className="pt-2"
        />
        {query.isError ? (
          <EmptyState
            compact
            icon={CheckCheck}
            title="Could not load approvals"
            description="Check your connection and try again."
            action={
              <Button variant="secondary" leftIcon={<RotateCw />} onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !query.data ? (
          <SkeletonRows rows={3} className="px-0" />
        ) : items.length === 0 ? (
          <EmptyState compact icon={CheckCheck} {...EMPTY[tab]} />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => (
              <ApprovalRow
                key={item.id}
                item={item}
                scope={tab}
                onDetails={() => setOpenId(item.id)}
              />
            ))}
          </ul>
        )}
      </Card>
      <ApprovalDetailDrawer
        item={open?.item ?? null}
        scope={open?.scope ?? tab}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function ApprovalRow({
  item,
  scope,
  onDetails,
}: {
  item: ApprovalItem;
  scope: ApprovalScope;
  onDetails: () => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useWithdrawApproval(() => setWithdrawing(false));
  const offer = item.type === 'Offer';
  const meta =
    scope === 'waiting'
      ? `Asked by ${item.requestedByName} · waiting ${waitedText(item.waitingSince)}`
      : scope === 'requested'
        ? `Asked ${formatDate(item.createdAt)} · ${item.approved} of ${item.total} approved`
        : `You ${item.decision === 'Approved' ? 'approved' : 'rejected'} ${item.decidedAt ? formatDate(item.decidedAt) : ''} · asked by ${item.requestedByName}`;
  return (
    <li className="flex flex-wrap items-start gap-4 py-5">
      <IconDisc
        icon={offer ? FileSignature : Briefcase}
        tone={offer ? 'amber' : 'blue'}
        size="md"
      />
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDetails}
            className="rounded-sm text-left text-md font-semibold text-fg hover:text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {item.title}
          </button>
          <Badge tone={offer ? 'amber' : 'blue'}>{TYPE_LABEL[item.type]}</Badge>
          {scope !== 'waiting' && (
            <Badge dot tone={outcomeTone[item.status]}>
              {OUTCOME_LABEL[item.status]}
            </Badge>
          )}
        </div>
        <SubjectLine item={item} />
        <p className="mt-1.5 flex items-center gap-2 text-xs text-fg-subtle">
          {scope === 'waiting' && <Avatar name={item.requestedByName} size="xs" />}
          {meta}
        </p>
        {item.note && scope === 'waiting' && (
          <blockquote className="mt-3 rounded-lg bg-muted px-3 py-2.5">
            <p className="text-xs text-fg-subtle">Note from {item.requestedByName}</p>
            <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg">{item.note}</p>
          </blockquote>
        )}
        {scope === 'done' && item.comment && (
          <p className="mt-2 text-sm whitespace-pre-wrap text-fg-muted">“{item.comment}”</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="quiet" onClick={onDetails} aria-label={`Details for ${item.title}`}>
          Details
        </Button>
        {scope === 'waiting' && item.canDecide && (
          <DecideControls approvalId={item.id} subject={item.title} />
        )}
        {scope === 'requested' && item.status === 'Pending' && (
          <Button variant="danger-quiet" onClick={() => setWithdrawing(true)}>
            Withdraw request
          </Button>
        )}
      </div>
      <ConfirmDialog
        opened={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this request?"
        message={`${item.title} goes back to draft and nobody is asked to approve it. You can send it again later.`}
        confirmLabel="Withdraw request"
        onConfirm={() =>
          withdraw.mutateAsync({ subjectType: item.type, subjectId: item.subjectId }).then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </li>
  );
}
