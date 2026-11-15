'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, PanelRightOpen, X } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  EmptyState,
  IconButton,
  SkeletonRows,
  SplitView,
  Textarea,
  Timeline,
} from '@/components/ui';
import { InterviewQuestions } from '@/features/applications/InterviewQuestions';
import { formatRelative, humanize } from '@/lib/format';
import { useLocalStorageState } from '@/lib/hooks';
import { isGeneral, useMyNotes } from './interview-notes';
import { SaveStatus } from './SaveStatus';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';
import { useInterviewRecord } from './InterviewRecord';
import { interviewHref, responsesOf, type InterviewDetail } from './interview-api';
import { browserZone, rangeText, zoneName } from './interview-state';

/** What the activity history calls each change, in plain words. */
const ACTIONS: Record<string, string> = {
  InterviewScheduled: 'Scheduled',
  InterviewUpdated: 'Details changed',
  InterviewRescheduled: 'Moved to a new time',
  InterviewCancelled: 'Cancelled',
  InterviewCancelledExternally: 'Removed from the organizer’s calendar',
  InterviewCompleted: 'Marked completed',
  InterviewNoShow: 'Marked as a no-show',
  MeetingNotesUpdated: 'Meeting notes saved',
  InterviewRecordingUploaded: 'Recording added',
  InterviewRecordingStarted: 'Recording started',
  InterviewBookedByCandidate: 'Booked by the candidate',
  RecordingTranscriptionQueued: 'Transcript asked for again',
  InterviewRecordingDeleted: 'Recording deleted',
  ScorecardSubmitted: 'Scorecard sent',
  ScorecardReminderSent: 'Scorecard reminder sent',
};

/** Overview: when and where, who, the questions, your notes, and the resume beside them. */
export function InterviewOverview() {
  const record = useInterviewRecord();
  const [resumeOpen, setResumeOpen] = useLocalStorageState('interview-prep:resume-open', true);
  const resume = (onClose?: () => void) => (
    <ResumeSummary candidateId={record.candidate.id} onClose={onClose} />
  );
  return (
    <SplitView
      storageKey="interview-prep"
      sideOpen={resumeOpen}
      defaultWidth={380}
      main={
        <div className="space-y-5">
          <WhenWhere />
          <Who />
          <KitCard interview={record.interview} candidateName={record.candidate.name} />
          <PrivateNotes id={record.interview.id} />
          <Activity />
          <div className="lg:hidden">{resume()}</div>
          {!resumeOpen && (
            <Button
              variant="secondary"
              className="hidden lg:inline-flex"
              leftIcon={<PanelRightOpen />}
              onClick={() => setResumeOpen(true)}
            >
              Show resume
            </Button>
          )}
        </div>
      }
      side={resume(() => setResumeOpen(false))}
    />
  );
}

function WhenWhere() {
  const { interview, candidate, canManage, state } = useInterviewRecord();
  const mine = browserZone();
  const meetingUrl = safeWebUrl(interview.meetingLink);
  const theirs = candidate.timeZone;
  const calendarText: Record<string, string> = {
    Created: 'Invites sent from a connected calendar.',
    Queued: 'Adding the invite to calendars now.',
    RetryScheduled: 'Adding the invite to calendars. Trying again soon.',
    NotConfigured: 'No calendar is connected. Everyone got the details by email.',
    Disconnected: 'The calendar that held the invite was disconnected.',
    Failed: 'The calendar invite did not go out.',
    ExternalUpdated: 'The time was changed in the organizer’s calendar.',
  };
  return (
    <Card>
      <CardHeader title="When and where" />
      <CardBody className="space-y-4">
        <div>
          <p className="text-md font-medium text-fg">
            {rangeText(interview.startsAt, interview.endsAt, mine)}
          </p>
          <p className="text-sm text-fg-subtle">{zoneName(mine, new Date(interview.startsAt))}</p>
          {theirs && theirs !== mine && (
            <p className="mt-1 text-sm text-fg-muted">
              For {candidate.name}: {rangeText(interview.startsAt, interview.endsAt, theirs)},{' '}
              {zoneName(theirs, new Date(interview.startsAt))}
            </p>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {meetingUrl ? (
            <>
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-base text-accent-foreground hover:underline"
              >
                {meetingUrl}
              </a>
              <CopyButton value={meetingUrl} label="Copy meeting link" />
            </>
          ) : interview.meetingType === 'Phone' ? (
            <p className="text-base text-fg">
              Phone call{interview.location ? ` on ${interview.location}` : ''}
            </p>
          ) : interview.meetingType === 'InPerson' ? (
            <p className="text-base text-fg">
              In person{interview.location ? `: ${interview.location}` : ''}
            </p>
          ) : interview.meetingType === 'GoogleMeet' || interview.meetingType === 'Teams' ? (
            <p className="text-base text-fg-muted">
              The {interview.meetingType === 'Teams' ? 'Teams' : 'Google Meet'} link comes with the
              calendar invite.
            </p>
          ) : (
            <p className="text-base text-fg-muted">
              {state.key === 'upcoming' && canManage
                ? 'No meeting link yet. Add one with Reschedule or edit.'
                : 'No meeting link.'}
            </p>
          )}
        </div>
        {canManage && calendarText[interview.calendarStatus] && (
          <p className="text-sm text-fg-subtle">{calendarText[interview.calendarStatus]}</p>
        )}
      </CardBody>
    </Card>
  );
}

function Who() {
  const user = useCurrentUser();
  const { interview, candidate, people, state } = useInterviewRecord();
  const started = !['upcoming', 'waiting', 'cancelled'].includes(state.key);
  const answers = responsesOf(interview.attendeeResponsesJson);
  const answer: Record<string, string> = {
    accepted: 'Accepted the invite',
    declined: 'Declined the invite',
    tentative: 'Said maybe',
  };
  return (
    <Card>
      <CardHeader title="Who" />
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        <li className="flex items-center gap-3 px-5 py-3">
          <Avatar name={candidate.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-fg">{candidate.name}</p>
            <p className="truncate text-xs text-fg-subtle">
              Candidate{candidate.title ? ` · ${candidate.title}` : ''}
            </p>
          </div>
        </li>
        {interview.interviewerEmails.map((email) => {
          const person = people[email];
          const submitted = interview.submittedEmails.includes(email);
          return (
            <li key={email} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={person?.name ?? email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-fg">
                  {person?.name ?? email}
                  {email === user.email && (
                    <span className="font-normal text-fg-subtle"> (you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {person ? humanize(person.role) : 'Not on the team'}
                  {person?.timeZone ? ` · ${zoneName(person.timeZone)}` : ''}
                  {!started && answer[answers[email]] && (
                    <span
                      className={answers[email] === 'declined' ? 'text-tone-red-fg' : undefined}
                    >
                      {' '}
                      · {answer[answers[email]]}
                    </span>
                  )}
                </p>
              </div>
              {submitted ? (
                <Badge tone="green" size="sm">
                  Scorecard in
                </Badge>
              ) : (
                started &&
                state.key !== 'noshow' && (
                  <Badge tone="amber" size="sm">
                    Scorecard due
                  </Badge>
                )
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function KitCard({
  interview,
  candidateName,
}: {
  interview: InterviewDetail;
  candidateName: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Questions to cover"
        description={
          interview.criteria.length ? 'You score each of these on your scorecard.' : undefined
        }
        action={
          interview.status !== 'Cancelled' && (
            <InterviewQuestions
              applicationId={interview.applicationId}
              interviewKitId={interview.interviewKitId}
              candidateName={candidateName}
            />
          )
        }
      />
      <CardBody className="space-y-3">
        {interview.interviewKitInstructions && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium text-fg-subtle">Interviewer instructions</p>
            <p className="mt-1 text-base whitespace-pre-wrap text-fg">
              {interview.interviewKitInstructions}
            </p>
          </div>
        )}
        {interview.criteria.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            This interview has no kit. Use Suggest questions, or ask the recruiter to add a kit so
            every interviewer scores the same things.
          </p>
        ) : (
          <ol className="space-y-2">
            {interview.criteria.map((criterion, index) => (
              <li key={criterion.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-fg">
                    <span className="text-fg-subtle tnum">{index + 1}.</span> {criterion.name}
                  </p>
                  <span className="text-xs text-fg-subtle tnum">Weight {criterion.weight}</span>
                </div>
                <p className="mt-1 text-base text-fg">{criterion.question}</p>
                {criterion.description && (
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    What good looks like: {criterion.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/** My general note, saved on the server. The Room has a note for each question too. */
function PrivateNotes({ id }: { id: string }) {
  const { assigned, state } = useInterviewRecord();
  const notes = useMyNotes(id);
  if (!assigned) return null;
  const general = notes.items.find(isGeneral);
  const setBody = (body: string) =>
    notes.update(
      general
        ? notes.items.map((item) => (item === general ? { ...item, body } : item))
        : [{ criterionId: null, question: null, body, covered: false }, ...notes.items],
    );
  return (
    <Card>
      <CardHeader
        title="Your notes"
        description="Only you see these. They sit beside your scorecard when you write it."
        action={
          ['upcoming', 'live'].includes(state.key) && (
            <Button asChild size="sm" variant="soft">
              <Link href={interviewHref(id, 'room')}>Open the room</Link>
            </Button>
          )
        }
      />
      <CardBody className="space-y-1.5">
        {notes.loading ? (
          <SkeletonRows rows={2} className="p-0" />
        ) : (
          <Textarea
            aria-label="Your notes"
            minRows={6}
            placeholder="What they said, examples they gave, follow-ups to ask…"
            value={general?.body ?? ''}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        )}
        <SaveStatus state={notes.state} onRetry={notes.retry} />
      </CardBody>
    </Card>
  );
}

function Activity() {
  const { activity, people } = useInterviewRecord();
  if (activity.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Activity" />
      <CardBody>
        <Timeline
          items={activity.map((item, index) => ({
            id: `${item.occurredAt}-${index}`,
            title: ACTIONS[item.action] ?? humanize(item.action),
            meta: `${
              people[item.actorEmail]?.name ??
              (item.actorEmail.includes(':') ? 'MyThorneAI' : item.actorEmail)
            } · ${formatRelative(item.occurredAt)}`,
            tone: item.action.includes('Cancel') ? 'red' : 'blue',
          }))}
        />
      </CardBody>
    </Card>
  );
}

/** The parsed resume in brief, for reading beside the questions. */
export function ResumeSummary({
  candidateId,
  onClose,
}: {
  candidateId: string;
  onClose?: () => void;
}) {
  const query = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${candidateId}`),
  });
  const candidate = query.data;
  const groups: [string, string[]][] = candidate
    ? [
        ['Recent roles', candidate.resumeJobTitles.slice(0, 5)],
        ['Education', candidate.resumeEducation],
        ['Certifications', candidate.resumeCertifications],
        ['Languages', candidate.resumeLanguages],
      ]
    : [];
  const empty =
    candidate &&
    !candidate.resumeSummary &&
    candidate.resumeSkills.length === 0 &&
    candidate.resumeJobTitles.length === 0;
  const facts =
    candidate &&
    [
      candidate.currentTitle,
      candidate.location,
      candidate.resumeYearsExperience != null &&
        `${candidate.resumeYearsExperience} years of experience`,
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Resume</h2>
          {facts && <p className="mt-0.5 text-sm text-fg-subtle">{facts}</p>}
        </div>
        {onClose && (
          <IconButton label="Hide resume" size="sm" variant="quiet" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>
      <CardBody className="space-y-4">
        {query.isError ? (
          <p className="text-sm text-fg-subtle">Could not load the resume.</p>
        ) : !candidate ? (
          <SkeletonRows rows={4} />
        ) : empty ? (
          <EmptyState
            compact
            icon={FileText}
            title="No resume details yet"
            description="Open the full profile to see the original file."
          />
        ) : (
          <>
            {candidate.resumeSummary && (
              <p className="text-sm whitespace-pre-wrap text-fg">{candidate.resumeSummary}</p>
            )}
            {candidate.resumeSkills.length > 0 && (
              <section>
                <h3 className="text-xs text-fg-subtle">Skills</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {candidate.resumeSkills.slice(0, 24).map((skill) => (
                    <Badge key={skill} size="sm">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
            {groups
              .filter(([, items]) => items.length > 0)
              .map(([title, items]) => (
                <section key={title}>
                  <h3 className="text-xs text-fg-subtle">{title}</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}
        <Link
          href={`/candidates/${candidateId}`}
          className="inline-block text-sm font-medium text-accent-foreground hover:underline"
        >
          Full resume and profile
        </Link>
      </CardBody>
    </Card>
  );
}
