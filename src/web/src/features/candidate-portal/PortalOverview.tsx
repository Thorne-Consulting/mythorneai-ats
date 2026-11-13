'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Gift,
  MessageSquare,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  EmptyState,
  PageHeader,
  Timeline,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import { safeWebUrl } from '@/lib/safe-url';
import { ApplicationCard, usePortalData } from './PortalShell';
import {
  activityFeed,
  isClosed,
  todoItems,
  upcomingInterviews,
  when,
  type TodoItem,
} from './portal';

const todoIcon: Record<TodoItem['kind'], LucideIcon> = {
  book: CalendarClock,
  message: MessageSquare,
  offer: Gift,
};
const todoTone: Record<TodoItem['kind'], string> = {
  book: 'bg-tone-amber-bg text-tone-amber-dot',
  message: 'bg-tone-blue-bg text-tone-blue-dot',
  offer: 'bg-tone-green-bg text-tone-green-dot',
};

/** /candidate-portal/home: what needs you, your next interview, applications and recent activity. */
export function PortalOverview() {
  const portal = usePortalData();
  const todo = todoItems(portal);
  const next = upcomingInterviews(portal)[0];
  const meetingUrl = safeWebUrl(next?.meetingLink);
  const active = portal.applications.filter((a) => !isClosed(a));
  const feed = activityFeed(portal, 6);

  return (
    <>
      <PageHeader title={`${greeting()}, ${portal.candidate.firstName}`} />
      <div className={cn('grid gap-5', next && 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="To do" />
            <CardBody>
              {todo.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg bg-tone-green-bg px-4 py-3">
                  <CheckCircle2 className="size-5 text-tone-green-dot" aria-hidden />
                  <p className="text-sm text-fg">
                    You&apos;re all caught up. We&apos;ll email you when something changes.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {todo.map((item) => {
                    const Icon = todoIcon[item.kind];
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="group flex items-center gap-3 rounded-lg border border-border-subtle px-4 py-3 transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-full',
                              todoTone[item.kind],
                            )}
                          >
                            <Icon className="size-[18px]" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-medium text-fg">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-fg-subtle">
                              {item.detail}
                            </span>
                          </span>
                          <ArrowRight
                            className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active applications"
              action={<CardLink href="/candidate-portal/applications">All applications</CardLink>}
            />
            <CardBody>
              {active.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="No active applications"
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/careers">See open jobs</Link>
                    </Button>
                  }
                />
              ) : (
                <div className={cn('grid gap-3', active.length > 1 && 'md:grid-cols-2')}>
                  {active.slice(0, 4).map((a) => (
                    <ApplicationCard key={a.id} application={a} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            <CardBody>
              {feed.length === 0 ? (
                <p className="text-sm text-fg-subtle">Nothing yet.</p>
              ) : (
                <Timeline
                  items={feed.map((f) => ({
                    id: f.id,
                    tone: f.tone,
                    title: (
                      <Link href={f.href} className="hover:underline">
                        {f.title}
                      </Link>
                    ),
                    meta: `${f.detail} · ${formatRelative(f.at)}`,
                  }))}
                />
              )}
            </CardBody>
          </Card>
        </div>

        {next && (
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <Card>
              <CardHeader title="Next interview" />
              <CardBody>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <span className="text-2xs font-semibold uppercase">
                        {new Date(next.startsAt).toLocaleDateString([], { month: 'short' })}
                      </span>
                      <span className="text-xl leading-none font-bold tnum">
                        {new Date(next.startsAt).getDate()}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-fg">{next.title}</p>
                      <p className="text-sm text-fg-muted">{when(next.startsAt)}</p>
                      <p className="truncate text-xs text-fg-subtle">{next.application.jobTitle}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {meetingUrl && (
                      <Button asChild size="sm">
                        <a href={meetingUrl} target="_blank" rel="noreferrer">
                          <Video /> Join meeting
                        </a>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="secondary">
                      <Link
                        href={`/candidate-portal/applications/${next.application.id}/interviews`}
                      >
                        Interview details
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
