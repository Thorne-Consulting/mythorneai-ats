'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronRight,
  CircleHelp,
  WifiOff,
  FileText,
  LayoutDashboard,
  MessageSquare,
} from 'lucide-react';
import { SectionNav } from '@/components/layout/SectionLayout';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkTabs,
  SkeletonRows,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { usePortal, useSignedInPortal } from './PortalProvider';
import {
  isClosed,
  statusSteps,
  todoItems,
  unreadCount,
  whatHappensNext,
  type PortalApplication,
} from './portal';

/**
 * Signed-in candidate portal: a sidebar (Overview, Applications, Interviews, Messages, Help) with
 * live counts beside the page, which becomes a row of tabs on small screens.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { portal, loadError, reload } = useSignedInPortal();
  if (!portal)
    return loadError ? (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={WifiOff}
          title="We couldn't load your portal"
          description={loadError}
          action={<Button onClick={reload}>Try again</Button>}
        />
      </Card>
    ) : (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );

  const apps = portal.applications;
  const active = apps.filter((a) => !isClosed(a)).length;
  const toBook = apps.reduce((n, a) => n + a.proposedInterviews.length, 0);
  const booked = apps.reduce((n, a) => n + a.interviews.length, 0);
  const unread = apps.reduce((n, a) => n + unreadCount(a), 0);
  const todo = todoItems(portal).length;
  const name = `${portal.candidate.firstName} ${portal.candidate.lastName}`.trim();

  const items = [
    { href: '/candidate-portal/home', label: 'Overview', icon: LayoutDashboard, count: todo },
    {
      href: '/candidate-portal/applications',
      label: 'Applications',
      icon: FileText,
      count: active,
    },
    {
      href: '/candidate-portal/interviews',
      label: 'Interviews',
      icon: CalendarDays,
      count: toBook || booked,
      badge:
        toBook > 0 ? (
          <Badge tone="amber" size="sm">
            Pick a time
          </Badge>
        ) : undefined,
    },
    { href: '/candidate-portal/messages', label: 'Messages', icon: MessageSquare, count: unread },
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:sticky lg:top-6 lg:w-60">
        <div className="hidden space-y-5 lg:block">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-fg">{name}</p>
              <p className="truncate text-xs text-fg-subtle">
                {portal.company ? `Applying to ${portal.company}` : 'Candidate'}
              </p>
            </div>
          </div>
          <SectionNav
            groups={[
              {
                items: items.map(({ badge, count, ...rest }) => ({
                  ...rest,
                  badge,
                  count: badge ? undefined : count,
                })),
              },
              {
                label: 'Support',
                items: [{ href: '/candidate-portal/help', label: 'Help', icon: CircleHelp }],
              },
            ]}
          />
        </div>
        <LinkTabs
          aria-label="Candidate portal"
          variant="pills"
          className="flex-nowrap overflow-x-auto scrollbar-hide lg:hidden"
          items={[
            ...items.map(({ href, label, count }) => ({ href, label, count })),
            { href: '/candidate-portal/help', label: 'Help' },
          ]}
        />
      </aside>
      <div className="min-w-0 flex-1">
        {loadError && (
          <Alert
            tone="warning"
            className="mb-4"
            action={
              <Button variant="secondary" size="sm" onClick={reload}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Alert>
        )}
        {children}
      </div>
    </div>
  );
}

/** Four-step progress bar for an application (received → review → interviews → decision). */
export function StepsBar({
  application,
  className,
}: {
  application: PortalApplication;
  className?: string;
}) {
  const steps = statusSteps(application);
  return (
    <div className={cn('flex gap-1', className)} aria-hidden>
      {steps.map((s) => (
        <span
          key={s.id}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            s.state === 'done' && 'bg-tone-green-dot',
            s.state === 'current' && 'bg-tone-blue-dot',
            s.state === 'todo' && 'bg-secondary',
            s.state === 'final' && (s.positive ? 'bg-tone-green-dot' : 'bg-tone-gray-dot'),
          )}
        />
      ))}
    </div>
  );
}

/** One application as a card: title, status, plain-words step, progress, flags. */
export function ApplicationCard({ application }: { application: PortalApplication }) {
  const unread = unreadCount(application);
  const toBook = application.proposedInterviews.length;
  const next = application.interviews
    .map((i) => i.startsAt)
    .filter((t) => new Date(t) > new Date())
    .sort()[0];
  return (
    <Link
      href={`/candidate-portal/applications/${application.id}`}
      className="group block rounded-xl border border-border-subtle bg-card p-5 shadow-card transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-md font-semibold text-fg">{application.jobTitle}</h3>
            <StatusBadge status={application.status} size="sm" />
          </div>
          <p className="mt-1 text-sm text-fg-muted">{whatHappensNext(application)}</p>
        </div>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <StepsBar application={application} className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-subtle">
        <span>Applied {formatDate(application.appliedAt)}</span>
        {toBook > 0 && (
          <Badge tone="amber" size="sm" icon={<CalendarDays />}>
            Pick an interview time
          </Badge>
        )}
        {next && (
          <Badge tone="blue" size="sm" icon={<CalendarDays />}>
            Interview {new Date(next).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </Badge>
        )}
        {unread > 0 && (
          <Badge tone="blue" size="sm" icon={<MessageSquare />}>
            {unread} new
          </Badge>
        )}
      </div>
    </Link>
  );
}

/** Used by pages that only need the current portal (already guarded by the shell). */
export function usePortalData() {
  const { portal } = usePortal();
  return portal!;
}
