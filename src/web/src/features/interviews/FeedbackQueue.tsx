'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/api';
import { Button, Card, CellStack, EmptyState, PageHeader } from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { DashboardData } from '@/types';
import { prepHref } from './interview-links';

type Due = DashboardData['scorecardsDue'][number];
// ponytail: the dashboard endpoint returns the oldest 10; a dedicated endpoint if people owe more.
const LIMIT = 10;

const scorecardHref = (row: Due) =>
  `/applications/${row.applicationId}/scorecards?interview=${row.id}`;
const daysSince = (value: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));

const columns: Column<Due>[] = [
  {
    id: 'candidate',
    header: 'Candidate',
    hideable: false,
    cell: (row) => <CellStack primary={row.candidateName} secondary={row.requisitionTitle} />,
    sortValue: (row) => row.candidateName,
  },
  { id: 'title', header: 'Interview', cell: (row) => row.title, sortValue: (row) => row.title },
  {
    id: 'ended',
    header: 'Ended',
    cell: (row) => <span title={formatDateTime(row.endsAt)}>{formatRelative(row.endsAt)}</span>,
    sortValue: (row) => new Date(row.endsAt),
    csv: (row) => row.endsAt,
  },
  {
    id: 'waiting',
    header: 'Waiting',
    align: 'right',
    cell: (row) => {
      const days = daysSince(row.endsAt);
      return (
        <span className={days >= 2 ? 'font-medium text-tone-amber-fg tnum' : 'tnum'}>
          {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
        </span>
      );
    },
    sortValue: (row) => daysSince(row.endsAt),
  },
  {
    id: 'action',
    header: <span className="sr-only">Action</span>,
    label: 'Action',
    align: 'right',
    hideable: false,
    cell: (row) => (
      <Button asChild size="sm" variant="secondary" onClick={(event) => event.stopPropagation()}>
        <Link href={scorecardHref(row)}>Write feedback</Link>
      </Button>
    ),
  },
];

/** Interviews you sat on that still need your scorecard, oldest first. */
export function FeedbackQueue() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });
  const due = query.data?.scorecardsDue ?? [];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Interviews', href: '/interviews' }, { label: 'My feedback' }]}
        title="My feedback"
        description="Interviews you were on that still need your scorecard. The oldest are first; feedback is sharpest while it is fresh."
      />
      <Card className="px-4 pb-2">
        <DataTable
          data={due}
          columns={columns}
          getRowId={(row) => row.id}
          viewKey="interviews-feedback"
          loading={query.isLoading}
          noun="interview"
          onRowOpen={(row) => router.push(prepHref(row))}
          rowLabel={(row) => `Open ${row.title} with ${row.candidateName}`}
          empty={
            query.isError ? (
              <EmptyState
                compact
                title="Could not load your feedback queue"
                action={
                  <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="You are all caught up"
                description="Every interview you were on has your scorecard. New ones show up here after they start."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/interviews">See upcoming interviews</Link>
                  </Button>
                }
              />
            )
          }
        />
        {due.length >= LIMIT && (
          <p className="px-1 py-2 text-xs text-fg-subtle">
            Showing your oldest {LIMIT}. Submit these and the next ones appear.
          </p>
        )}
      </Card>
    </>
  );
}
