'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileSearch } from 'lucide-react';
import { ChatBubble, MessageBody } from '@/components/messages/Chat';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  EmptyState,
  PageHeader,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { Interviews, StatusCard, Withdraw } from './ApplicationParts';
import { DocumentsCard, SentCard } from './ApplicationDocuments';
import { jobPath } from '@/features/careers/jobs';
import { usePortal } from './PortalProvider';
import { PortalAssessments } from '@/features/assessments/take/PortalAssessments';
import { usePortalData } from './PortalShell';
import { conversationHref, isClosed, whatHappensNext } from './portal';
import { OfferLinkCard } from './offer/OfferPage';

const HOME = { label: 'Home', href: '/candidate-portal/home' };

/**
 * /candidate-portal/applications/[id]: one page for one application. Where it stands, its
 * interviews, the latest messages, and a quiet way to withdraw at the bottom.
 */
export function ApplicationPage({ id }: { id: string }) {
  const portal = usePortalData();
  const { call, reload } = usePortal();
  const [confirming, setConfirming] = useState(false);
  const application = portal.applications.find((a) => a.id === id);
  const found = !!application;
  // Email links point at a section (#interviews, #documents). It renders after the data loads,
  // so the browser's own jump missed it.
  useEffect(() => {
    const target = found && window.location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, [found]);
  if (!application)
    return (
      <>
        <PageHeader breadcrumbs={[HOME]} title="Application not found" />
        <Card>
          <EmptyState
            icon={FileSearch}
            title="It may belong to a different email address"
            description="Sign in with the email you used to apply, or go back to your applications."
            action={
              <Button asChild>
                <Link href={HOME.href}>See your applications</Link>
              </Button>
            }
          />
        </Card>
      </>
    );

  async function confirm() {
    setConfirming(true);
    const { ok } = await call(
      `/public/portal/applications/${id}/confirm`,
      undefined,
      'We could not confirm your application. Please try again.',
    );
    if (ok) toast.success('Application confirmed');
    await reload();
    setConfirming(false);
  }

  const latest = application.thread.slice(-2);
  return (
    <>
      <PageHeader
        breadcrumbs={[HOME]}
        title={application.jobTitle}
        description={whatHappensNext(application)}
        actions={
          application.jobListed ? (
            <Button asChild variant="secondary">
              <Link href={jobPath({ id: application.requisitionId, title: application.jobTitle })}>
                <ExternalLink /> View job
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-5">
        {!application.emailConfirmed && !isClosed(application) && (
          <Alert
            tone="warning"
            title="Is this application yours?"
            action={
              <Button size="sm" loading={confirming} onClick={confirm}>
                Yes, confirm it
              </Button>
            }
          >
            Confirm it so the team knows it came from you. If you did not apply, withdraw it at the
            bottom of this page.
          </Alert>
        )}
        <OfferLinkCard applicationId={application.id} />
        <StatusCard application={application} />
        <Interviews application={application} title="Interviews" />
        <PortalAssessments applicationId={application.id} />
        <DocumentsCard application={application} />
        <Card>
          <CardHeader
            title="Messages"
            action={<CardLink href={conversationHref(application.id)}>Open conversation</CardLink>}
          />
          <CardBody className="flex flex-col gap-3">
            {latest.length === 0 ? (
              <p className="text-sm text-fg-subtle">
                No messages yet. Questions about this job? Write to the team in your Inbox.
              </p>
            ) : (
              latest.map((m) => (
                <ChatBubble
                  key={m.id}
                  direction={m.fromCandidate ? 'out' : 'in'}
                  time={`${m.fromCandidate ? 'You' : 'Hiring team'} · ${formatDateTime(m.createdAt)}`}
                >
                  <MessageBody body={m.body} markdown={!m.fromCandidate} />
                </ChatBubble>
              ))
            )}
          </CardBody>
        </Card>
        <SentCard application={application} />
        {application.canWithdraw && (
          <div className="flex justify-end border-t border-border-subtle pt-4">
            <Withdraw application={application} />
          </div>
        )}
      </div>
    </>
  );
}
