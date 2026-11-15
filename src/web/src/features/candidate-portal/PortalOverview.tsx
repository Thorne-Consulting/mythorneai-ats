'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  FilePlus2,
  FileText,
  Gift,
  MailWarning,
  MessageSquare,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Collapse,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { safeWebUrl } from '@/lib/safe-url';
import { PortalAssessments } from '@/features/assessments/take/PortalAssessments';
import { ApplicationCard, usePortalData } from './PortalShell';
import {
  applicationHref,
  dayLabel,
  interviewSoon,
  isClosed,
  sortApplications,
  timeRange,
  todoItems,
  type TodoItem,
} from './portal';

const todoIcon: Record<TodoItem['kind'], LucideIcon> = {
  confirm: MailWarning,
  book: CalendarClock,
  document: FilePlus2,
  message: MessageSquare,
  offer: Gift,
};
const todoTone: Record<TodoItem['kind'], string> = {
  confirm: 'bg-tone-amber-bg text-tone-amber-dot',
  book: 'bg-tone-amber-bg text-tone-amber-dot',
  document: 'bg-tone-amber-bg text-tone-amber-dot',
  message: 'bg-tone-blue-bg text-tone-blue-dot',
  offer: 'bg-tone-green-bg text-tone-green-dot',
};

/** /candidate-portal/home: the next interview first, then what needs doing, then every application. */
export function PortalOverview() {
  const portal = usePortalData();
  const todo = todoItems(portal);
  const soon = interviewSoon(portal);
  const apps = sortApplications(portal.applications);
  const active = apps.filter((a) => !isClosed(a));
  const closed = apps.filter(isClosed);
  const [showClosed, setShowClosed] = useState(active.length === 0);

  return (
    <>
      <PageHeader title={`${greeting()}, ${portal.candidate.firstName}`} />
      <div className="flex flex-col gap-5">
        {soon && <NextInterview interview={soon} />}

        {todo.length > 0 && (
          <Card>
            <CardHeader title="To do" />
            <CardBody>
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
                          <span className="block text-base font-medium text-fg">{item.title}</span>
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
            </CardBody>
          </Card>
        )}

        <PortalAssessments />

        <Card>
          <CardHeader title="Your applications" />
          <CardBody className="space-y-3">
            {apps.length === 0 ? (
              <EmptyState
                compact
                icon={FileText}
                title="No applications yet"
                description="When you apply for a job, you can follow it here."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/careers">See open jobs</Link>
                  </Button>
                }
              />
            ) : (
              <>
                {active.length === 0 && (
                  <p className="text-sm text-fg-muted">
                    You have no open applications.{' '}
                    <Link
                      href="/careers"
                      className="font-medium text-accent-foreground hover:underline"
                    >
                      See open jobs
                    </Link>
                  </p>
                )}
                {active.map((a) => (
                  <ApplicationCard key={a.id} application={a} />
                ))}
                {closed.length > 0 && (
                  <div>
                    <button
                      type="button"
                      aria-expanded={showClosed}
                      onClick={() => setShowClosed((v) => !v)}
                      className="flex items-center gap-1.5 rounded-sm py-1 text-sm font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChevronDown
                        className={cn('size-4 transition-transform', !showClosed && '-rotate-90')}
                        aria-hidden
                      />
                      Closed applications ({closed.length})
                    </button>
                    <Collapse open={showClosed}>
                      <div className="mt-2 space-y-3">
                        {closed.map((a) => (
                          <ApplicationCard key={a.id} application={a} />
                        ))}
                      </div>
                    </Collapse>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/** The interview within the next week, with the time in the candidate's zone and a join button. */
function NextInterview({
  interview,
}: {
  interview: NonNullable<ReturnType<typeof interviewSoon>>;
}) {
  const meetingUrl = safeWebUrl(interview.meetingLink);
  const start = new Date(interview.startsAt);
  return (
    <Card className="border-tone-blue-dot/30">
      <CardBody className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <span className="text-2xs font-semibold uppercase">
              {start.toLocaleDateString([], { month: 'short' })}
            </span>
            <span className="text-xl leading-none font-bold tnum">{start.getDate()}</span>
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-accent-foreground">Your next interview</p>
            <p className="text-md font-semibold text-fg">
              {interview.title} · {interview.application.jobTitle}
            </p>
            <p className="text-sm text-fg-muted">
              {dayLabel(interview.startsAt)}, {timeRange(interview.startsAt, interview.endsAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`${applicationHref(interview.application.id)}#interviews`}>Details</Link>
          </Button>
          {meetingUrl && (
            <Button asChild>
              <a href={meetingUrl} target="_blank" rel="noreferrer">
                <Video /> Join meeting
              </a>
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
