'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Send, X } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  DescriptionList,
  Drawer,
  SkeletonRows,
  Timeline,
  type TimelineEntry,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ApprovalTimeline, DecideControls } from './ApprovalParts';
import type { ApprovalView, PendingApproval } from './approval-data';

// Same endpoints and cache keys as OfferPanel and RequisitionApproval, so decisions refresh both.
function useChain(item: PendingApproval | null) {
  const offer = item?.type === 'Offer' && item.applicationId ? item.applicationId : null;
  const job = item?.type === 'Requisition' && item.requisitionId ? item.requisitionId : null;
  return useQuery({
    queryKey: offer ? ['offer', offer] : ['requisition-approval', job],
    queryFn: () =>
      api.get<{ approvals: ApprovalView[]; sequential: boolean }>(
        offer ? `/api/applications/${offer}/offer` : `/api/requisitions/${job}/approval`,
      ),
    enabled: !!(offer || job),
    retry: false,
  });
}

/** Side panel for one approval: the request, every approver in order, and what has happened so far. */
export function ApprovalDetailDrawer({
  item,
  typeLabel,
  onClose,
}: {
  item: PendingApproval | null;
  typeLabel: string;
  onClose: () => void;
}) {
  const chain = useChain(item);
  const approvals = chain.data?.approvals ?? [];
  const href = item?.applicationId
    ? `/applications/${item.applicationId}`
    : item?.requisitionId
      ? `/jobs/${item.requisitionId}`
      : null;

  const history: TimelineEntry[] = item
    ? [
        {
          id: 'requested',
          icon: <Send />,
          title: `${item.requestedByName} asked for approval`,
          meta: formatDateTime(item.createdAt),
          body: item.note ? <p className="whitespace-pre-wrap">{item.note}</p> : undefined,
        },
        ...approvals
          .filter((a) => a.decidedAt)
          .sort((a, b) => (a.decidedAt! < b.decidedAt! ? -1 : 1))
          .map((a) => ({
            id: a.id,
            icon: a.decision === 'Approved' ? <Check /> : <X />,
            title: `${a.approverName} ${a.decision === 'Approved' ? 'approved' : 'rejected'}`,
            meta: formatDateTime(a.decidedAt!),
            body: a.comment ? <p className="whitespace-pre-wrap">{a.comment}</p> : undefined,
          })),
      ]
    : [];

  return (
    <Drawer
      opened={item !== null}
      onClose={onClose}
      size="lg"
      title={item?.title ?? ''}
      description={item?.detail || undefined}
      footer={
        item && (
          <>
            {href && (
              <Button asChild variant="quiet" className="mr-auto">
                <Link href={href}>{item.applicationId ? 'Open application' : 'Open job'}</Link>
              </Button>
            )}
            <DecideControls approvalId={item.id} subject={item.title} />
          </>
        )
      }
    >
      {item && (
        <div className="flex flex-col gap-6">
          <DescriptionList
            columns={2}
            items={[
              {
                label: 'Type',
                value: <Badge tone={item.type === 'Offer' ? 'amber' : 'blue'}>{typeLabel}</Badge>,
              },
              {
                label: 'Asked by',
                value: (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={item.requestedByName} size="xs" />
                    {item.requestedByName}
                  </span>
                ),
              },
              { label: 'Asked on', value: formatDateTime(item.createdAt) },
              {
                label: 'Order',
                value: chain.data
                  ? chain.data.sequential
                    ? 'One after another'
                    : 'All at once'
                  : '—',
              },
            ]}
          />

          <section aria-labelledby="approval-chain">
            <h3 id="approval-chain" className="mb-3 text-md font-semibold text-fg">
              Approval chain
            </h3>
            {chain.isError ? (
              <Alert tone="info" title="Only the job’s hiring team can see the full chain">
                You can still approve or reject. Your decision is recorded either way.
              </Alert>
            ) : !chain.data ? (
              <SkeletonRows rows={2} className="px-0" />
            ) : approvals.length === 0 ? (
              <p className="text-sm text-fg-subtle">No approvers are listed yet.</p>
            ) : (
              <ApprovalTimeline approvals={approvals} />
            )}
          </section>

          <section aria-labelledby="approval-history">
            <h3 id="approval-history" className="mb-3 text-md font-semibold text-fg">
              History
            </h3>
            <Timeline items={history} />
          </section>
        </div>
      )}
    </Drawer>
  );
}
