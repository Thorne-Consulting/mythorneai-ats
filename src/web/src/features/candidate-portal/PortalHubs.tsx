'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, MessageSquare } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { ConversationRow } from '@/components/messages/Chat';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { plainPreview } from '@/features/messages/inbox-format';
import { Interviews, Thread } from './ApplicationParts';
import { usePortalData } from './PortalShell';
import { applicationHref, conversationHref, isClosed, unreadCount } from './portal';

/** /candidate-portal/interviews: every application with interviews, ones needing a time first. */
export function PortalInterviews() {
  const portal = usePortalData();
  const withInterviews = portal.applications
    .filter((a) => a.proposedInterviews.length + a.interviews.length > 0)
    .sort((a, b) => b.proposedInterviews.length - a.proposedInterviews.length);

  return (
    <>
      <PageHeader title="Interviews" />
      {withInterviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No interviews yet"
            description="When the hiring team wants to meet you, they suggest times. You pick one here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {withInterviews.map((a) => (
            <Interviews
              key={a.id}
              application={a}
              title={
                <Link href={applicationHref(a.id)} className="hover:underline">
                  {a.jobTitle}
                </Link>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

const lastAt = (a: { thread: { createdAt: string }[]; lastActivityAt: string }) =>
  a.thread[a.thread.length - 1]?.createdAt ?? a.lastActivityAt;

/**
 * /candidate-portal/messages and /messages/[id]: one conversation per application, with the
 * emails we sent shown as notes inside it. Each conversation has its own address, so Back works.
 */
export function PortalInbox({ selectedId }: { selectedId?: string }) {
  const portal = usePortalData();
  const router = useRouter();
  const apps = [...portal.applications].sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  const current = apps.find((a) => a.id === selectedId);

  // Wide screens open the newest conversation; phones start on the list.
  useEffect(() => {
    if (!selectedId && apps[0] && window.matchMedia('(min-width: 1024px)').matches)
      router.replace(conversationHref(apps[0].id));
  }, [selectedId, apps, router]);

  return (
    <>
      <PageHeader title="Inbox" className={cn(current && 'max-lg:hidden')} />
      {apps.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Once you apply for a job, you can write to the hiring team here."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <ul
              aria-label="Conversations"
              className={cn('border-border-subtle lg:border-r', current && 'max-lg:hidden')}
            >
              {apps.map((a) => {
                const last = a.thread[a.thread.length - 1];
                return (
                  <li key={a.id}>
                    <ConversationRow
                      name={a.jobTitle}
                      subtitle={isClosed(a) ? 'Closed' : (portal.company ?? 'Hiring team')}
                      preview={
                        last
                          ? `${last.fromCandidate ? 'You: ' : ''}${last.fromCandidate ? last.body : plainPreview(last.body)}`
                          : 'No messages yet'
                      }
                      time={last ? formatRelative(last.createdAt) : undefined}
                      unread={unreadCount(a) > 0}
                      selected={a.id === selectedId}
                      onClick={() => router.push(conversationHref(a.id))}
                    />
                  </li>
                );
              })}
            </ul>
            <div className={cn('min-w-0 p-4 sm:p-5', !current && 'max-lg:hidden')}>
              {current ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href="/candidate-portal/messages"
                      aria-label="All conversations"
                      className="rounded-md p-1.5 text-fg-muted hover:bg-accent hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
                    >
                      <ArrowLeft className="size-5" aria-hidden />
                    </Link>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-fg">
                        <Link href={applicationHref(current.id)} className="hover:underline">
                          {current.jobTitle}
                        </Link>
                      </h2>
                      <p className="text-xs text-fg-subtle">
                        {portal.company
                          ? `With the ${portal.company} hiring team`
                          : 'With the hiring team'}
                      </p>
                    </div>
                  </div>
                  <Thread key={current.id} application={current} />
                </div>
              ) : (
                <EmptyState compact icon={MessageSquare} title="Choose a conversation" />
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
