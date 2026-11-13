'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, FileSearch, Mail } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkTabs,
  PageHeader,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { formatDate, formatRelative } from '@/lib/format';
import { EmailsList, Interviews, StatusCard, Thread, Withdraw } from './ApplicationParts';
import { StepsBar, usePortalData } from './PortalShell';
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
        <PageHeader breadcrumbs={[BACK, { label: 'Not found' }]} title="Application not found" />
        <Card>
          <EmptyState
            icon={FileSearch}
            title="We cannot find that application"
            description="It may belong to a different email address."
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
        breadcrumbs={[BACK, { label: application.jobTitle }]}
        title={application.jobTitle}
        description={whatHappensNext(application)}
        actions={<StatusBadge status={application.status} />}
      >
        <StepsBar application={application} className="max-w-md" />
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
                The team proposed interview times. Pick the one that suits you.
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
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <DescriptionList
              items={[
                { label: 'Applied', value: formatDate(application.appliedAt) },
                { label: 'Last update', value: formatRelative(application.lastActivityAt) },
              ]}
            />
            <Link
              href={`/careers/${application.requisitionId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              View the job posting <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </CardBody>
        </Card>
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
      <CardHeader
        title="Emails we sent you"
        description="Copies of the emails about this application, newest first."
      />
      <CardBody>
        {application.messages.length === 0 ? (
          <EmptyState
            compact
            icon={Mail}
            title="No emails yet"
            description="Emails about this application will show up here too."
          />
        ) : (
          <EmailsList application={application} />
        )}
      </CardBody>
    </Card>
  );
}

function nextSteps(a: PortalApplication) {
  if (a.status === 'Hired')
    return 'Congratulations! The team will be in touch about your start date and first day.';
  if (a.status === 'Rejected')
    return 'This application is closed. Thank you for your time. You are welcome to apply for other roles.';
  if (a.status === 'Withdrawn')
    return 'You withdrew this application. You can apply again in the future.';
  if (isClosed(a)) return 'This application is closed.';
  if (a.proposedInterviews.length > 0)
    return 'Pick an interview time so the team can confirm it with you.';
  if (a.interviews.length > 0)
    return 'Your interview is booked. You will get a reminder, and you can change the time from the Interviews tab if you need to.';
  const s = a.stage.toLowerCase();
  if (s.includes('offer'))
    return 'The team is finalising an offer. Watch your email for the details.';
  if (s.includes('interview'))
    return 'The team is arranging interviews. You will be asked to pick a time here.';
  return 'The team is reviewing your application. Reviews usually take a few days; you will hear from us either way.';
}
