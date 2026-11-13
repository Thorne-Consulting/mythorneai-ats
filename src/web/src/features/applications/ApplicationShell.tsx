'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, UserX } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { StageBadge, StatusBadge } from '@/components/status';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  DescriptionList,
  LinkTabs,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import type { ApplicationDetailResponse } from '@/types';
import {
  canManageRole,
  LoadError,
  OfflineNotice,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { useApplicationExtras } from './application-extras';
import { InterviewModal } from './InterviewModal';
import { useOffer } from './OfferPanel';
import { RejectModal } from './RejectModal';

/** Record page frame: identity header, sub-route tabs, main column and the right rail. */
export function ApplicationShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: ApplicationDetailResponse;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const query = useApplication(id, initialData);
  const { messages } = useApplicationExtras(id);
  const offer = useOffer(id).data?.offer;
  const invalidate = useInvalidateApplication(id);
  const [rejectOpened, setRejectOpened] = useState(false);
  const [scheduleOpened, setScheduleOpened] = useState(false);
  const canManage = canManageRole(user.role);
  const stageMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.patch<void>(`/api/applications/${id}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Applicant moved');
    },
    // The API refuses a straight move to Hired (409) and explains why; show that, not a generic error.
    onError: (error: Error) => toast.error('Could not move this applicant', error.message),
  });

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (query.fetchStatus === 'paused') return <OfflineNotice onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const application = query.data.application;
  const unread = messages.filter((message) => message.fromCandidate && !message.readAt).length;
  const subtitle = [application.candidateTitle, application.candidateLocation]
    .filter(Boolean)
    .join(' · ');
  // Hired is finished; the only way back is "Reverse" on the acceptance panel.
  const canMove = canManage && application.status !== 'Hired';

  return (
    <>
      <header className="mb-5 space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Candidates', href: '/candidates' },
            { label: application.candidateName, href: `/candidates/${application.candidateId}` },
            { label: application.requisitionTitle },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden>
              <Avatar name={application.candidateName} size="xl" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg">
                  {application.candidateName}
                </h1>
                <StageBadge stage={application.stage} />
                {application.status !== 'Active' && <StatusBadge status={application.status} />}
              </div>
              <p className="mt-1 text-base text-fg-muted">
                <Link
                  href={`/jobs/${application.requisitionId}`}
                  className="font-medium text-accent-foreground hover:underline"
                >
                  {application.requisitionTitle}
                </Link>
                {subtitle && ` · ${subtitle}`}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {canMove && (
                <Select
                  aria-label="Current stage"
                  value={application.stageId}
                  onChange={(value) =>
                    value && value !== application.stageId && stageMutation.mutate(value)
                  }
                  data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                  disabled={stageMutation.isPending}
                  className="w-44"
                />
              )}
              {canMove && (
                <Button
                  variant="danger-quiet"
                  leftIcon={<UserX />}
                  onClick={() => setRejectOpened(true)}
                >
                  Reject
                </Button>
              )}
              <Button leftIcon={<CalendarPlus />} onClick={() => setScheduleOpened(true)}>
                Schedule interview
              </Button>
            </div>
          )}
        </div>
        <LinkTabs
          aria-label="Application sections"
          items={[
            { label: 'Overview', href: `/applications/${id}`, exact: true },
            {
              label: 'Interviews',
              href: `/applications/${id}/interviews`,
              count: application.interviews.length,
            },
            {
              label: 'Scorecards',
              href: `/applications/${id}/scorecards`,
              count: application.interviews.reduce(
                (sum, item) => sum + item.submittedScorecards,
                0,
              ),
            },
            // Approvers who are not on the hiring team still see the offer they were asked about.
            ...(canManage || offer ? [{ label: 'Offer', href: `/applications/${id}/offer` }] : []),
            ...(canManage || messages.length > 0
              ? [{ label: 'Messages', href: `/applications/${id}/messages`, count: unread }]
              : []),
            { label: 'Activity', href: `/applications/${id}/activity` },
          ]}
        />
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">{children}</div>
        <aside className="space-y-5" aria-label="Applicant details">
          <Card>
            <CardHeader
              title="Applicant"
              action={<CardLink href={`/candidates/${application.candidateId}`}>Profile</CardLink>}
            />
            <CardBody className="space-y-4">
              <DescriptionList
                className="space-y-3"
                items={[
                  {
                    label: 'Email',
                    value: (
                      <a
                        href={`mailto:${application.candidateEmail}`}
                        className="text-accent-foreground hover:underline"
                      >
                        {application.candidateEmail}
                      </a>
                    ),
                  },
                  { label: 'Phone', value: application.candidatePhone ?? '–' },
                  { label: 'Location', value: application.candidateLocation ?? '–' },
                  { label: 'Source', value: application.source },
                  { label: 'Applied', value: formatDate(application.appliedAt) },
                  { label: 'Last activity', value: formatRelative(application.lastActivityAt) },
                  ...(application.dispositionReason
                    ? [{ label: 'Reason', value: application.dispositionReason }]
                    : []),
                ]}
              />
              {application.candidateTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {application.candidateTags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              )}
              <Link
                href={`/candidates/${application.candidateId}`}
                className="inline-block text-sm font-medium text-accent-foreground hover:underline"
              >
                Resume and other applications
              </Link>
            </CardBody>
          </Card>
          <NextInterview id={id} interviews={application.interviews} />
          <OfferStatus applicationId={id} />
        </aside>
      </div>

      <RejectModal
        applicationId={id}
        stageId={application.stageId}
        opened={rejectOpened}
        onClose={() => setRejectOpened(false)}
        onSaved={invalidate}
      />
      <InterviewModal
        applicationId={id}
        interviewKits={application.interviewKits}
        opened={scheduleOpened}
        onClose={() => setScheduleOpened(false)}
        onSaved={invalidate}
      />
    </>
  );
}

function NextInterview({
  id,
  interviews,
}: {
  id: string;
  interviews: ApplicationDetailResponse['application']['interviews'];
}) {
  const now = Date.now();
  const next = interviews
    .filter(
      (item) =>
        !['Cancelled', 'Completed', 'NoShow'].includes(item.status) &&
        new Date(item.endsAt).getTime() > now,
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  return (
    <div className="rounded-xl bg-accent p-4">
      <h2 className="text-base font-semibold text-fg">Next interview</h2>
      {next ? (
        <>
          <p className="mt-1.5 text-sm text-fg">{next.title}</p>
          <p className="text-sm text-fg-muted">
            {formatDateTime(next.startsAt)}–
            {new Date(next.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-fg-muted">Nothing scheduled.</p>
      )}
      <Link
        href={`/applications/${id}/interviews`}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
      >
        {next ? 'View interview' : 'All interviews'}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

/** Where the acceptance stands. The full page is the Offer tab. */
function OfferStatus({ applicationId }: { applicationId: string }) {
  const offer = useOffer(applicationId).data?.offer;
  if (!offer || offer.status === 'Withdrawn') return null;
  return (
    <Card className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">Acceptance</h2>
        <Link
          href={`/applications/${applicationId}/offer`}
          className="text-sm text-accent-foreground hover:underline"
        >
          Open offer
        </Link>
      </div>
      <StatusBadge status={offer.status} />
    </Card>
  );
}
