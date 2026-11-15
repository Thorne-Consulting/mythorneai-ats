'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Link2,
  MoreHorizontal,
  RotateCcw,
  UserX,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { StatusBadge } from '@/components/status';
import {
  Avatar,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  LinkTabs,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useHotkeys } from '@/lib/hooks';
import type { ApplicationDetailResponse, Stage } from '@/types';
import {
  LoadError,
  OfflineNotice,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { useApplicationExtras } from './application-extras';
import { scheduleHref } from '@/features/interviews/interview-links';
import type { ApplicationDetail } from './application-types';
import { MoveStageDialog, stageCanEmail } from './MoveStageDialog';
import { liveOffer, useOffer } from './offer-data';
import { RejectModal } from './RejectModal';
import { daysSince } from './scorecard-math';

/** Record page frame: identity, where they are in the stage path, the next move, and the tabs. */
export function ApplicationShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: ApplicationDetailResponse;
  children: ReactNode;
}) {
  const onOfferTab = usePathname()?.endsWith('/offer') ?? false;
  const query = useApplication(id, initialData);
  const { messages } = useApplicationExtras(id);
  const canManage = query.data?.canManage ?? false;
  const offer = useOffer(id);
  const invalidate = useInvalidateApplication(id);
  const [rejectOpened, setRejectOpened] = useState(false);
  const router = useRouter();
  const [reopenOpened, setReopenOpened] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Stage | null>(null);
  const application = query.data?.application;
  const active = canManage && application?.status === 'Active';

  useHotkeys([
    ['m', () => active && setMoveOpen(true)],
    ['r', () => active && setRejectOpened(true)],
  ]);

  const stageMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.patch<void>(`/api/applications/${id}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: (_, stageId) => {
      invalidate();
      toast.success(`Moved to ${application?.stages.find((s) => s.id === stageId)?.name}`);
    },
    // The API refuses a straight move to Hired (409) and explains why; show that, not a generic error.
    onError: (error: Error) => toast.error('Could not move this applicant', error.message),
  });
  const reopen = useMutation({
    mutationFn: () => api.post(`/api/applications/${id}/reopen`),
    onSuccess: () => {
      invalidate();
      toast.success('Application reopened');
    },
    onError: (error: Error) => toast.error('Could not reopen this application', error.message),
  });

  // A stage that emails candidates asks first and shows the email; any other stage moves straight away.
  const moveTo = (stage: Stage) =>
    stageCanEmail(stage) ? setMoveTarget(stage) : stageMutation.mutate(stage.id);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (query.fetchStatus === 'paused' && !application)
    return <OfflineNotice onRetry={query.refetch} />;
  if (!application)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );

  const unread = messages.filter((message) => message.fromCandidate && !message.readAt).length;
  const subtitle = [application.candidateTitle, application.candidateLocation]
    .filter(Boolean)
    .join(' · ');
  const stages = [...application.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = stages.findIndex((stage) => stage.id === application.stageId);
  const next = stages[currentIndex + 1];
  // Hired is reached through an accepted offer, never by moving the card.
  const isHire = (stage: Stage) => stage.type === 'Hired' || stage.isTerminal;
  const nextIsHire = !next || isHire(next);
  const hasOffer = Boolean(liveOffer(offer.data));
  const closed = application.status === 'Rejected' || application.status === 'Withdrawn';
  const copyLink = () =>
    navigator.clipboard
      .writeText(window.location.origin + `/applications/${id}`)
      .then(() => toast.success('Link copied'));

  return (
    <>
      <header className="mb-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Breadcrumbs
            items={[
              { label: 'Candidates', href: '/candidates' },
              { label: application.candidateName, href: `/candidates/${application.candidateId}` },
              { label: application.requisitionTitle },
            ]}
          />
          <ApplicantSteps id={id} stageId={application.stageId} status={application.status} />
        </div>
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
              {active && (
                <Button
                  variant="danger-quiet"
                  leftIcon={<UserX />}
                  onClick={() => setRejectOpened(true)}
                >
                  Reject
                </Button>
              )}
              {closed && (
                <Button
                  variant="secondary"
                  leftIcon={<RotateCcw />}
                  onClick={() => setReopenOpened(true)}
                >
                  Reopen application
                </Button>
              )}
              {active && (
                <MoreActions
                  onSchedule={() => router.push(scheduleHref({ application: id }))}
                  offerHref={`/applications/${id}/offer`}
                  hasOffer={hasOffer}
                  onCopy={copyLink}
                />
              )}
              {!active && (
                <Menu modal={false}>
                  <MenuTrigger asChild>
                    <IconButton label="More actions" variant="secondary">
                      <MoreHorizontal />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem icon={<Link2 />} onSelect={copyLink}>
                      Copy link
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
              {active &&
                (nextIsHire ? (
                  !onOfferTab && (
                    <Button asChild leftIcon={<FileSignature />}>
                      <Link href={`/applications/${id}/offer`}>
                        {hasOffer ? 'Open offer' : 'Make an offer'}
                      </Link>
                    </Button>
                  )
                ) : (
                  <div className="flex">
                    <Button
                      className="rounded-r-none"
                      loading={stageMutation.isPending}
                      onClick={() => moveTo(next)}
                    >
                      Move to {next.name}
                    </Button>
                    <Menu open={moveOpen} onOpenChange={setMoveOpen} modal={false}>
                      <MenuTrigger asChild>
                        <IconButton
                          label="Move to another stage"
                          className="rounded-l-none border-l border-primary-foreground/25"
                          variant="primary"
                        >
                          <ChevronDown />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuLabel>Move to</MenuLabel>
                        {stages.map((stage) => {
                          const hire = isHire(stage);
                          return (
                            <MenuItem
                              key={stage.id}
                              disabled={stage.id === application.stageId || hire}
                              onSelect={() => moveTo(stage)}
                            >
                              {stage.name}
                              {stage.id === application.stageId && (
                                <span className="ml-auto text-xs text-fg-subtle">Current</span>
                              )}
                              {hire && (
                                <span className="ml-auto text-xs text-fg-subtle">
                                  Through an offer
                                </span>
                              )}
                            </MenuItem>
                          );
                        })}
                      </MenuContent>
                    </Menu>
                  </div>
                ))}
            </div>
          )}
        </div>
        <StageStepper application={application} stages={stages} currentIndex={currentIndex} />
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
              label: 'Feedback',
              href: `/applications/${id}/scorecards`,
              count: application.interviews.reduce(
                (sum, item) => sum + item.submittedScorecards,
                0,
              ),
            },
            // Approvers who are not on the hiring team still see the offer they were asked about.
            ...(canManage || offer.data?.offer
              ? [{ label: 'Offer', href: `/applications/${id}/offer` }]
              : []),
            ...(canManage || messages.length > 0
              ? [{ label: 'Messages', href: `/applications/${id}/messages`, count: unread }]
              : []),
            { label: 'Activity', href: `/applications/${id}/activity` },
          ]}
        />
      </header>

      {children}

      <MoveStageDialog
        applicationId={id}
        firstName={application.candidateName.split(' ')[0]}
        stage={moveTarget}
        onClose={() => setMoveTarget(null)}
        onMoved={invalidate}
      />
      <RejectModal
        applicationId={id}
        stageId={application.stageId}
        firstName={application.candidateName.split(' ')[0]}
        doNotContact={Boolean(application.candidateDoNotContact)}
        opened={rejectOpened}
        onClose={() => setRejectOpened(false)}
        onSaved={invalidate}
      />
      <ConfirmDialog
        opened={reopenOpened}
        onClose={() => setReopenOpened(false)}
        title="Reopen this application?"
        confirmLabel="Reopen application"
        confirmVariant="primary"
        message={`It goes back to ${application.stage} as active. ${application.candidateName.split(' ')[0]} is not emailed.`}
        onConfirm={() =>
          reopen.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </>
  );
}

function MoreActions({
  onSchedule,
  offerHref,
  hasOffer,
  onCopy,
}: {
  onSchedule: () => void;
  offerHref: string;
  hasOffer: boolean;
  onCopy: () => void;
}) {
  const router = useRouter();
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton label="More actions" variant="secondary">
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<CalendarPlus />} onSelect={onSchedule}>
          Schedule interview
        </MenuItem>
        <MenuItem icon={<FileSignature />} onSelect={() => router.push(offerHref)}>
          {hasOffer ? 'Open offer' : 'Make an offer'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Link2 />} onSelect={onCopy}>
          Copy link
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

const statusBar: Record<string, string> = {
  Rejected: 'bg-tone-red-dot',
  Withdrawn: 'bg-tone-gray-dot',
  Hired: 'bg-tone-green-dot',
};

/** The stage path, with the current stage and how long they have been in it. */
function StageStepper({
  application,
  stages,
  currentIndex,
}: {
  application: ApplicationDetail;
  stages: ApplicationDetail['stages'];
  currentIndex: number;
}) {
  const days = daysSince(application.stageEnteredAt);
  const reached = statusBar[application.status] ?? 'bg-primary';
  return (
    <div className="max-w-3xl space-y-2">
      <ol
        aria-label="Stages"
        className="hidden gap-1 sm:grid"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
      >
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            aria-current={index === currentIndex ? 'step' : undefined}
            className="min-w-0"
          >
            <span
              aria-hidden
              className={cn(
                'block h-1.5 rounded-full',
                index < currentIndex && 'bg-primary/40',
                index === currentIndex && reached,
                index > currentIndex && 'bg-secondary',
              )}
            />
            <span
              className={cn(
                'mt-1.5 block truncate text-xs',
                index === currentIndex
                  ? 'font-semibold text-fg'
                  : index < currentIndex
                    ? 'text-fg-muted'
                    : 'text-fg-subtle',
              )}
            >
              {stage.name}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg sm:sr-only">
          {application.stage} (step {currentIndex + 1} of {stages.length}) ·{' '}
        </span>
        {application.status === 'Active'
          ? days === 0
            ? 'Moved to this stage today'
            : `${days} ${days === 1 ? 'day' : 'days'} in this stage`
          : application.status === 'Hired'
            ? 'Hired'
            : `${application.status === 'Withdrawn' ? 'Withdrew' : 'Rejected'} at this stage${application.dispositionReason ? `: ${application.dispositionReason}` : ''}`}
      </p>
      {application.status !== 'Active' && application.dispositionNote && (
        <p className="mt-1 max-w-2xl text-sm whitespace-pre-wrap text-fg-muted">
          {application.dispositionNote}
        </p>
      )}
    </div>
  );
}

type Neighbors = {
  stage: { id: string; name: string };
  position: number | null;
  total: number;
  previous: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
};

/**
 * "3 of 12 in Review" with previous and next applicant (K and J). The stage stays fixed in the
 * address while you work through it, so moving someone on does not lose your place.
 */
function ApplicantSteps({ id, stageId, status }: { id: string; stageId: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const stage = useSearchParams()?.get('stage') ?? stageId;
  const neighbors = useQuery({
    queryKey: ['application-neighbors', id, stage, stageId, status],
    queryFn: () =>
      api.get<Neighbors>(`/api/applications/${id}/neighbors?stageId=${encodeURIComponent(stage)}`),
  });
  // The same tab on the other applicant: Feedback stays Feedback.
  const tab = pathname.replace(/^\/applications\/[^/]+/, '');
  const href = (other: string) => `/applications/${other}${tab}?stage=${stage}`;
  const data = neighbors.data;
  useHotkeys([
    ['j', () => data?.next && router.push(href(data.next.id))],
    ['k', () => data?.previous && router.push(href(data.previous.id))],
  ]);
  if (!data || data.total === 0 || (data.total === 1 && data.position)) return null;
  return (
    <nav aria-label="Applicants in this stage" className="flex items-center gap-1">
      <span className="mr-1 text-sm text-fg-muted tnum">
        {data.position ? `${data.position} of ${data.total}` : `${data.total} active`} in{' '}
        {data.stage.name}
      </span>
      <IconButton
        label={data.previous ? `Previous: ${data.previous.name} (K)` : 'No previous applicant'}
        variant="secondary"
        size="sm"
        disabled={!data.previous}
        onClick={() => data.previous && router.push(href(data.previous.id))}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        label={data.next ? `Next: ${data.next.name} (J)` : 'No next applicant'}
        variant="secondary"
        size="sm"
        disabled={!data.next}
        onClick={() => data.next && router.push(href(data.next.id))}
      >
        <ChevronRight />
      </IconButton>
    </nav>
  );
}
