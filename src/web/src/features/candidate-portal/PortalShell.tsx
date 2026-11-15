'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, MailWarning, MessageSquare, WifiOff } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, SkeletonRows } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { usePortal, useSignedInPortal } from './PortalProvider';
import { PortalTabBar } from './PortalNav';
import {
  applicationHref,
  statusSteps,
  unreadCount,
  whatHappensNext,
  type PortalApplication,
} from './portal';

/**
 * Signed-in candidate portal: Home, Interviews and Inbox, in the header on wider screens and as a
 * bottom tab bar on phones. Pages render only their content.
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

  return (
    <div className="mx-auto max-w-4xl">
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
      <PortalTabBar portal={portal} />
    </div>
  );
}

/** Where an application is, as labelled steps: Received → Review → Interviews → Decision. */
export function PhaseSteps({
  application,
  className,
}: {
  application: PortalApplication;
  className?: string;
}) {
  const steps = statusSteps(application).filter((s) => s.state !== 'final');
  return (
    <ol
      className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs', className)}
      aria-label="Progress"
    >
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span
            aria-current={s.state === 'current' ? 'step' : undefined}
            className={cn(
              s.state === 'done' && 'text-fg-muted',
              s.state === 'current' && 'font-semibold text-accent-foreground',
              s.state === 'todo' && 'text-fg-subtle',
            )}
          >
            {s.id === 'applied' ? 'Received' : s.title.replace(/^Current step: /, '')}
          </span>
          {i < steps.length - 1 && <ChevronRight className="size-3 text-fg-subtle" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** One application as a row: job, plain-words status, labelled progress and what needs doing. */
export function ApplicationCard({ application }: { application: PortalApplication }) {
  const unread = unreadCount(application);
  const toBook = application.proposedInterviews.length;
  const closed = ['Rejected', 'Withdrawn', 'Hired'].includes(application.status);
  return (
    <Link
      href={applicationHref(application.id)}
      className="group block rounded-xl border border-border-subtle bg-card p-4 transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-md font-semibold text-fg">{application.jobTitle}</h3>
          <p className="mt-0.5 text-sm text-fg-muted">
            {whatHappensNext(application)}
            <span className="text-fg-subtle"> · Applied {formatDate(application.appliedAt)}</span>
          </p>
        </div>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      {!closed && <PhaseSteps application={application} className="mt-3" />}
      {(toBook > 0 || unread > 0 || !application.emailConfirmed) && !closed && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!application.emailConfirmed && (
            <Badge tone="amber" size="sm" icon={<MailWarning />}>
              Email not confirmed
            </Badge>
          )}
          {toBook > 0 && (
            <Badge tone="amber" size="sm" icon={<CalendarDays />}>
              Pick an interview time
            </Badge>
          )}
          {unread > 0 && (
            <Badge tone="blue" size="sm" icon={<MessageSquare />}>
              {unread} new {unread === 1 ? 'message' : 'messages'}
            </Badge>
          )}
        </div>
      )}
    </Link>
  );
}

/** Used by pages that only need the current portal (already guarded by the shell). */
export function usePortalData() {
  const { portal } = usePortal();
  return portal!;
}
