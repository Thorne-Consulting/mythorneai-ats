'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, ClipboardCheck } from 'lucide-react';
import { api } from '@/api';
import { RecommendationBadge } from '@/components/status';
import { Button, Card, EmptyState, PageHeader, SkeletonRows, Tabs } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

interface QueueItem {
  id: string;
  applicationId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateName: string;
  requisitionTitle: string;
  submittedAt?: string | null;
  recommendation?: string | null;
}
interface Queue {
  counts: { due: number; submitted: number };
  reminderDays: number;
  items: QueueItem[];
}

const scorecardHref = (row: QueueItem) =>
  `/applications/${row.applicationId}/scorecards?interview=${row.id}`;

/** "Ended 5 hours ago", tinted once it passes the organization's reminder point. */
function Waiting({ endsAt, reminderDays }: { endsAt: string; reminderDays: number }) {
  const hours = Math.floor((Date.now() - new Date(endsAt).getTime()) / 3_600_000);
  if (hours < 0) return <span className="text-sm text-fg-muted">In progress</span>;
  const days = Math.floor(hours / 24);
  const text =
    hours < 1
      ? 'Ended just now'
      : hours < 24
        ? `Ended ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
        : `Ended ${days} ${days === 1 ? 'day' : 'days'} ago`;
  const late = hours >= reminderDays * 24;
  return (
    <span
      className={cn(
        'text-sm tnum',
        late ? 'font-medium text-tone-amber-fg' : 'text-fg-muted',
        hours >= reminderDays * 48 && 'text-tone-red-fg',
      )}
    >
      {text}
    </span>
  );
}

/** Interviews you were on: the ones that still need your scorecard, and the ones you sent. */
export function FeedbackQueue() {
  const [tab, setTab] = useState<'due' | 'submitted'>('due');
  const query = useQuery({
    queryKey: ['my-scorecards', tab],
    queryFn: () => api.get<Queue>(`/api/me/scorecards?status=${tab}`),
  });
  const counts = query.data?.counts;
  const items = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Interviews', href: '/interviews' }, { label: 'My feedback' }]}
        title="My feedback"
        description="Write your scorecard soon after each interview, while it is fresh."
      />
      <Card>
        <Tabs
          aria-label="Feedback"
          value={tab}
          onValueChange={(value) => setTab(value as 'due' | 'submitted')}
          items={[
            { value: 'due', label: 'Needs feedback', count: counts?.due },
            { value: 'submitted', label: 'Submitted', count: counts?.submitted },
          ]}
          className="px-5 pt-2"
        />
        {query.isPending ? (
          <SkeletonRows rows={4} className="p-5" />
        ) : query.isError ? (
          <EmptyState
            compact
            title="Could not load your scorecards"
            description="Check your connection, then try again."
            action={
              <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          tab === 'due' ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              title="You are all caught up"
              description="Interviews show up here once they start."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/interviews">See upcoming interviews</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              compact
              icon={ClipboardCheck}
              title="No scorecards yet"
              description="Scorecards you submit are kept here, so you can find them later."
            />
          )
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((row) => (
              <li key={row.id}>
                <Link
                  href={scorecardHref(row)}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-fg">{row.candidateName}</p>
                    <p className="mt-0.5 truncate text-sm text-fg-muted">
                      {row.title} · {row.requisitionTitle}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                    {row.recommendation ? (
                      <>
                        <span className="text-sm text-fg-subtle">
                          {formatDate(row.submittedAt ?? undefined)}
                        </span>
                        <RecommendationBadge recommendation={row.recommendation} />
                      </>
                    ) : (
                      <Waiting endsAt={row.endsAt} reminderDays={query.data.reminderDays || 2} />
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
