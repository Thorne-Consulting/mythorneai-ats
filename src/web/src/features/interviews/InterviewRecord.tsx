'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, CalendarX2, ExternalLink, MoreHorizontal, UserX } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  LinkTabs,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  PageHeader,
  SkeletonRows,
} from '@/components/ui';
import { LoadError } from '@/features/applications/application-data';
import { formatDateTime } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import { CancelInterviewDialog, OutcomeDialog } from './InterviewDialogs';
import {
  interviewHref,
  useInterview,
  useRefreshInterview,
  useInBrowser,
  type InterviewRecordData,
} from './interview-api';
import { scheduleHref } from './interview-links';
import { interviewState, whenPhrase, type InterviewState } from './interview-state';

type RecordContext = InterviewRecordData & {
  state: InterviewState;
  /** You are on the panel. */
  assigned: boolean;
  /** You are on the panel and your scorecard is in. */
  submitted: boolean;
  refresh: () => void;
};

const Context = createContext<RecordContext | null>(null);

/** The interview page's data for its tabs. */
export function useInterviewRecord() {
  const value = useContext(Context);
  if (!value) throw new Error('useInterviewRecord must be used inside InterviewRecord');
  return value;
}

const crumbs = [{ label: 'Interviews', href: '/interviews' }];

/**
 * One interview's page, with a permanent address that every email links to. The header knows the
 * time (Upcoming, Live now, Ended) and offers the next step; the tabs hold the details.
 */
export function InterviewRecord({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData?: InterviewRecordData;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const query = useInterview(id, initialData);
  const inBrowser = useInBrowser();
  const refreshAll = useRefreshInterview();
  const router = useRouter();
  const pathname = usePathname();
  const intent = useSearchParams().get('do');
  const [dialog, setDialog] = useState<'cancel' | 'Completed' | 'NoShow' | null>(null);
  // The clock moves the state along (Upcoming → Live now → Ended) without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // "Reschedule" and "Cancel" from the calendar's popover arrive here as ?do=.
  useEffect(() => {
    if (intent === 'reschedule') router.replace(scheduleHref({ interview: id }));
    else if (intent === 'cancel') {
      setDialog(intent);
      router.replace(pathname, { scroll: false });
    }
  }, [intent, pathname, router, id]);

  if (query.isError)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <LoadError error={query.error} onRetry={query.refetch} />
      </>
    );
  // Times are in the reader's zone, so the page draws in the browser (the server checked it exists).
  if (!query.data || !inBrowser)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    );

  const data = query.data;
  const { interview, candidate, job, canManage } = data;
  const state = interviewState(interview.status, interview.startsAt, interview.endsAt, now);
  const assigned = interview.interviewerEmails.includes(user.email);
  const submitted = interview.submittedEmails.includes(user.email);
  const owes = assigned && !submitted && ['live', 'ended', 'completed'].includes(state.key);
  const meetingUrl = safeWebUrl(interview.meetingLink);
  const soon = new Date(interview.startsAt).getTime() - now.getTime() < 15 * 60_000;
  const joinable = meetingUrl && (state.key === 'live' || (state.key === 'upcoming' && soon));
  const active = state.key === 'upcoming' || state.key === 'waiting' || state.key === 'live';
  const refresh = () => refreshAll(id, interview.applicationId);
  const phrase = whenPhrase(state, interview.startsAt, interview.endsAt, now);
  const nameOf = (email?: string | null) =>
    email ? (data.people[email]?.name ?? (email.startsWith('system:') ? 'MyThorneAI' : email)) : '';

  const started = state.key !== 'upcoming' && state.key !== 'waiting' && state.key !== 'cancelled';
  const tabs = [
    { label: 'Overview', href: interviewHref(id), exact: true },
    ...((assigned || canManage) && state.key !== 'cancelled'
      ? [{ label: 'Room', href: interviewHref(id, 'room') }]
      : []),
    // Recording and summary only make sense once the interview has started.
    ...(started
      ? [
          {
            label: 'Recording',
            href: interviewHref(id, 'recording'),
            count: interview.recordings.length,
          },
        ]
      : []),
    // The summary is for the people who run the job, and for the panel once their scorecard is in.
    ...(started && (canManage || (assigned && submitted))
      ? [{ label: 'Summary', href: interviewHref(id, 'summary') }]
      : []),
    {
      label: 'Feedback',
      href: interviewHref(id, 'feedback'),
      count: interview.submittedScorecards,
    },
  ];
  // Around the start, the room is the next step for the panel.
  const roomTime = assigned && (state.key === 'live' || (state.key === 'upcoming' && soon));

  return (
    <Context.Provider value={{ ...data, state, assigned, submitted, refresh }}>
      <PageHeader
        breadcrumbs={[...crumbs, { label: candidate.name }]}
        title={interview.title}
        actions={
          <>
            {meetingUrl && active && (
              <Button asChild variant={joinable ? 'primary' : 'secondary'}>
                <a href={meetingUrl} target="_blank" rel="noreferrer">
                  Join meeting
                  <ExternalLink />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
            {roomTime && !pathname.endsWith('/room') && (
              <Button asChild variant={joinable ? 'secondary' : 'primary'}>
                <Link href={interviewHref(id, 'room')}>Open the room</Link>
              </Button>
            )}
            {owes && !roomTime && (
              <Button asChild variant={joinable ? 'secondary' : 'primary'}>
                <Link href={interviewHref(id, 'feedback')}>Write scorecard</Link>
              </Button>
            )}
            {canManage && (
              <Menu modal={false}>
                <MenuTrigger asChild>
                  <IconButton label="More actions" variant="secondary">
                    <MoreHorizontal />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="end">
                  {interview.status !== 'Cancelled' && (
                    <MenuItem onSelect={() => router.push(scheduleHref({ interview: id }))}>
                      {active ? 'Reschedule or edit' : 'Edit details'}
                    </MenuItem>
                  )}
                  {(state.key === 'live' || state.key === 'ended' || state.key === 'completed') && (
                    <MenuItem onSelect={() => setDialog('Completed')}>Mark completed</MenuItem>
                  )}
                  {(state.key === 'live' || state.key === 'ended' || state.key === 'completed') && (
                    <MenuItem onSelect={() => setDialog('NoShow')}>Mark as no-show</MenuItem>
                  )}
                  <MenuItem
                    onSelect={() => router.push(`/applications/${interview.applicationId}`)}
                  >
                    Open application
                  </MenuItem>
                  {(state.key === 'upcoming' || state.key === 'waiting') && (
                    <>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setDialog('cancel')}>
                        Cancel interview
                      </MenuItem>
                    </>
                  )}
                </MenuContent>
              </Menu>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-fg-muted">
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
          {phrase && <span>{phrase}</span>}
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span>
            <Link
              href={`/applications/${interview.applicationId}`}
              className="font-medium text-accent-foreground hover:underline"
            >
              {candidate.name}
            </Link>{' '}
            for{' '}
            <Link href={`/jobs/${job.id}`} className="text-accent-foreground hover:underline">
              {job.title}
            </Link>
          </span>
          {assigned && submitted && (
            <Badge tone="green" size="sm">
              Your scorecard is in
            </Badge>
          )}
          {owes && (
            <Badge tone="amber" size="sm" dot>
              Your scorecard is due
            </Badge>
          )}
        </div>
        <LinkTabs aria-label="Interview sections" items={tabs} />
      </PageHeader>

      <div className="space-y-5">
        {state.key === 'ended' && canManage && (
          <Alert
            tone="warning"
            icon={CalendarClock}
            title="This interview has ended. How did it go?"
          >
            <p>With no answer, it counts as completed a day after it ends.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="soft" onClick={() => setDialog('Completed')}>
                Mark completed
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog('NoShow')}>
                Mark as no-show
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push(scheduleHref({ interview: id }))}
              >
                Reschedule
              </Button>
            </div>
          </Alert>
        )}
        {state.key === 'cancelled' && (
          <Alert tone="neutral" icon={CalendarX2} title="This interview was cancelled">
            {[
              interview.cancelledBy && `By ${nameOf(interview.cancelledBy)}`,
              interview.cancelledAt && `on ${formatDateTime(interview.cancelledAt)}`,
            ]
              .filter(Boolean)
              .join(' ')}
            {interview.cancelReason && `. Reason: ${interview.cancelReason}.`}
          </Alert>
        )}
        {state.key === 'noshow' && (
          <Alert tone="danger" icon={UserX} title="Marked as a no-show">
            {interview.noShowParty === 'Interviewer'
              ? 'An interviewer did not attend.'
              : `${candidate.name} did not attend.`}
            {interview.outcomeNote && ` ${interview.outcomeNote}`}
          </Alert>
        )}
        {canManage &&
          active &&
          (interview.calendarStatus === 'Failed' ||
            interview.calendarStatus === 'Disconnected') && (
            <Alert tone="warning" title="The calendar invite did not go out">
              {interview.calendarError ??
                'We could not add this interview to a calendar. Everyone still got an email.'}
            </Alert>
          )}
        {children}
      </div>

      {canManage && (
        <>
          <CancelInterviewDialog
            interviewId={id}
            applicationId={interview.applicationId}
            title={interview.title}
            candidateName={candidate.name}
            opened={dialog === 'cancel'}
            onClose={() => setDialog(null)}
          />
          <OutcomeDialog
            interviewId={id}
            applicationId={interview.applicationId}
            candidateName={candidate.name}
            initial={dialog === 'NoShow' ? 'NoShow' : 'Completed'}
            opened={dialog === 'Completed' || dialog === 'NoShow'}
            onClose={() => setDialog(null)}
          />
        </>
      )}
    </Context.Provider>
  );
}

/** Shown by a tab that the reader cannot use yet. */
export function TabNotice({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <EmptyState compact icon={CalendarClock} title={title} description={description} />
    </Card>
  );
}
