'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, FileSearch, Mail } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkTabs,
  PageHeader,
} from '@/components/ui';
import { EmailsList, Interviews, StatusCard, Thread, Withdraw } from './ApplicationParts';
import { usePortalData } from './PortalShell';
import { isClosed, unreadCount, when, whatHappensNext, type PortalApplication } from './portal';

const Ctx = createContext<PortalApplication | null>(null);
const useApplication = () => useContext(Ctx)!;

const BACK = { label: 'Applications', href: '/candidate-portal/applications' };

/**
 * /candidate-portal/applications/[id]/*: job header with status and progress, then tabs for
 * Overview, Interviews, Messages and Emails. Tab pages read the application from context.
 */
export function ApplicationFrame({ id, children }: { id: string; children: ReactNode }) {
  const portal = usePortalData();
  const application = portal.applications.find((a) => a.id === id);
  if (!application)
    return (
      <>
        <PageHeader breadcrumbs={[BACK]} title="Application not found" />
        <Card>
          <EmptyState
            icon={FileSearch}
            title="It may belong to a different email address"
            description="Sign in with the email you used to apply, or go back to your applications."
            action={
              <Button asChild>
                <Link href={BACK.href}>See your applications</Link>
              </Button>
            }
          />
        </Card>
      </>
    );

  const base = `/candidate-portal/applications/${application.id}`;
  const interviews = application.interviews.length + application.proposedInterviews.length;
  return (
    <Ctx.Provider value={application}>
      <PageHeader
        breadcrumbs={[BACK]}
        title={application.jobTitle}
        description={whatHappensNext(application)}
        actions={
          <Button asChild variant="secondary" leftIcon={<ExternalLink />}>
            <Link href={`/careers/${application.requisitionId}`}>View job posting</Link>
          </Button>
        }
      >
        <LinkTabs
          aria-label="Application sections"
          items={[
            { href: base, label: 'Overview', exact: true },
            { href: `${base}/interviews`, label: 'Interviews', count: interviews },
            { href: `${base}/messages`, label: 'Messages', count: unreadCount(application) },
            { href: `${base}/emails`, label: 'Emails', count: application.messages.length },
          ]}
        />
      </PageHeader>
      {children}
    </Ctx.Provider>
  );
}

/** Overview tab: timeline, what happens next, details and withdraw. */
export function ApplicationOverviewTab() {
  const application = useApplication();
  const base = `/candidate-portal/applications/${application.id}`;
  const next = application.interviews
    .filter((i) => new Date(i.endsAt) > new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        {application.proposedInterviews.length > 0 && (
          <Card className="border-tone-amber-dot/40">
            <CardBody className="flex flex-wrap items-center gap-3 pt-5">
              <CalendarClock className="size-5 text-tone-amber-dot" aria-hidden />
              <p className="flex-1 text-base text-fg">
                The team suggested some interview times. Pick the one that works for you.
              </p>
              <Button asChild size="sm">
                <Link href={`${base}/interviews`}>Pick a time</Link>
              </Button>
            </CardBody>
          </Card>
        )}
        <StatusCard application={application} />
        <Card>
          <CardHeader title="What happens next" />
          <CardBody className="text-sm text-fg-muted">{nextSteps(application)}</CardBody>
        </Card>
      </div>
      <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
        {next && (
          <Card>
            <CardHeader title="Next interview" />
            <CardBody className="space-y-2">
              <p className="text-base font-medium text-fg">{next.title}</p>
              <p className="text-sm text-fg-muted">{when(next.startsAt)}</p>
              <Link
                href={`${base}/interviews`}
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                Interview details
              </Link>
            </CardBody>
          </Card>
        )}
        {application.canWithdraw && <Withdraw application={application} />}
      </aside>
    </div>
  );
}

export function ApplicationInterviewsTab() {
  return <Interviews application={useApplication()} />;
}

export function ApplicationMessagesTab() {
  const application = useApplication();
  return (
    <Card>
      <CardBody className="pt-5">
        <Thread application={application} />
      </CardBody>
    </Card>
  );
}

export function ApplicationEmailsTab() {
  const application = useApplication();
  return (
    <Card>
      <CardHeader title="Emails we sent you" />
      <CardBody>
        {application.messages.length === 0 ? (
          <EmptyState compact icon={Mail} title="No emails yet" />
        ) : (
          <EmailsList application={application} />
        )}
      </CardBody>
    </Card>
  );
}

function nextSteps(a: PortalApplication) {
  if (a.status === 'Hired')
    return 'Congratulations. The team will contact you about your start date.';
  if (a.status === 'Rejected')
    return 'Thank you for your time. You are welcome to apply for other jobs.';
  if (a.status === 'Withdrawn') return 'You can apply again in the future.';
  if (isClosed(a)) return 'This application is closed.';
  if (a.proposedInterviews.length > 0)
    return 'Once you pick a time, the team confirms it with you.';
  if (a.interviews.length > 0)
    return 'You will get a reminder before your interview. Need a different time? Change it on the Interviews tab.';
  const s = a.stage.toLowerCase();
  if (s.includes('offer'))
    return 'The team is preparing an offer. Watch your email for the details.';
  if (s.includes('interview'))
    return 'The team will suggest interview times. You can pick one here.';
  return 'Reviews usually take a few days. You will hear from us either way.';
}
