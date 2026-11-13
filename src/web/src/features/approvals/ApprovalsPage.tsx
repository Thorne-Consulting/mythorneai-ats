'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, CheckCheck, FileSignature, RotateCw } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconDisc,
  PageHeader,
  SkeletonRows,
  Tabs,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { usePendingApprovals, type PendingApproval } from './approval-data';
import { DecideControls } from './ApprovalParts';
import { ApprovalDetailDrawer } from './ApprovalDetail';

const TYPE_LABEL: Record<PendingApproval['type'], string> = {
  Offer: 'Acceptance',
  Requisition: 'New job',
};

export function ApprovalsPage() {
  const query = usePendingApprovals();
  const items = query.data ?? [];
  const [tab, setTab] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  // Derived from the list, so the drawer closes on its own once you decide (the item leaves it).
  const open = items.find((i) => i.id === openId) ?? null;
  const count = (type: PendingApproval['type']) => items.filter((i) => i.type === type).length;
  // ponytail: the API only lists approvals waiting on you (/approvals/mine), so tabs split by kind.
  const shown = tab === 'all' ? items : items.filter((i) => i.type === tab);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Jobs and acceptances waiting for your sign-off. Approve, or reject with a reason the requester can act on."
      />
      <Card className="px-5">
        <Tabs
          aria-label="Approval type"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'all', label: 'Waiting on me', count: items.length },
            { value: 'Offer', label: 'Acceptances', count: count('Offer') },
            { value: 'Requisition', label: 'New jobs', count: count('Requisition') },
          ]}
          className="pt-2"
        />
        {query.isError ? (
          <EmptyState
            compact
            icon={CheckCheck}
            title="Could not load your approvals"
            description="Check your connection and try again."
            action={
              <Button variant="secondary" leftIcon={<RotateCw />} onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !query.data ? (
          <SkeletonRows rows={3} className="px-0" />
        ) : shown.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCheck}
            title="Nothing is waiting on you"
            description="When someone asks you to approve a job or an acceptance, it shows up here and in the bell."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {shown.map((item) => (
              <ApprovalRow key={item.id} item={item} onDetails={() => setOpenId(item.id)} />
            ))}
          </ul>
        )}
      </Card>
      <ApprovalDetailDrawer
        item={open}
        typeLabel={open ? TYPE_LABEL[open.type] : ''}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function ApprovalRow({ item, onDetails }: { item: PendingApproval; onDetails: () => void }) {
  const href = item.applicationId
    ? `/applications/${item.applicationId}`
    : item.requisitionId
      ? `/jobs/${item.requisitionId}`
      : null;
  return (
    <li className="flex flex-wrap items-start gap-4 py-5">
      <IconDisc
        icon={item.type === 'Offer' ? FileSignature : Briefcase}
        tone={item.type === 'Offer' ? 'amber' : 'blue'}
        size="md"
      />
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="text-md font-semibold text-fg hover:text-accent-foreground hover:underline"
            >
              {item.title}
            </Link>
          ) : (
            <p className="text-md font-semibold text-fg">{item.title}</p>
          )}
          <Badge tone={item.type === 'Offer' ? 'amber' : 'blue'}>{TYPE_LABEL[item.type]}</Badge>
        </div>
        {item.detail && <p className="mt-0.5 text-sm text-fg-muted">{item.detail}</p>}
        <p className="mt-1.5 flex items-center gap-2 text-xs text-fg-subtle">
          <Avatar name={item.requestedByName} size="xs" />
          Asked by {item.requestedByName} · {formatDateTime(item.createdAt)}
        </p>
        {item.note && (
          <blockquote className="mt-3 rounded-lg bg-muted px-3 py-2">
            <p className="text-xs text-fg-subtle">Note from {item.requestedByName}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{item.note}</p>
          </blockquote>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="quiet" onClick={onDetails} aria-label={`Details for ${item.title}`}>
          Details
        </Button>
        {href && (
          <Button asChild variant="quiet">
            <Link href={href} aria-label={`Open ${item.title}`}>
              {item.applicationId ? 'Open application' : 'Open job'}
            </Link>
          </Button>
        )}
        <DecideControls approvalId={item.id} subject={item.title} />
      </div>
    </li>
  );
}
