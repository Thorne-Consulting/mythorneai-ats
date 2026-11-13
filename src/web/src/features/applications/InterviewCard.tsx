'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, ExternalLink, MoreHorizontal, NotebookPen, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { RecommendationBadge, StatusBadge } from '@/components/status';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  IconDisc,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Rating,
  toast,
} from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { InterviewKit } from '@/types';
import type { Interview } from './application-types';
import { AiSummary } from './AiSummary';
import { InterviewModal } from './InterviewModal';
import { InterviewQuestions } from './InterviewQuestions';
import { InterviewRecorder } from './InterviewRecorder';
import { MeetingNotesModal } from './MeetingNotesModal';
import { RecordingTranscripts } from './RecordingTranscripts';
import { ScorecardModal } from './ScorecardModal';

const CALENDAR: Record<string, string> = {
  Created: 'On calendar',
  Queued: 'Adding to calendar',
  RetryScheduled: 'Retrying calendar',
  Failed: 'Calendar invite failed',
  CancellationQueued: 'Removing from calendar',
  Cancelled: 'Removed from calendar',
  ExternalCancelled: 'Cancelled in calendar',
  ExternalUpdated: 'Changed in calendar',
};

function ScoreValue({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden>
        <Rating value={value} readOnly size="sm" />
      </span>
      <span
        className="text-sm font-semibold text-fg tnum"
        aria-label={`${label}: ${value} out of 5`}
      >
        {value}/5
      </span>
    </span>
  );
}

export function InterviewCard({
  interview,
  applicationId,
  candidateName,
  currentEmail,
  canManage,
  interviewKits,
  onUpdated,
}: {
  interview: Interview;
  applicationId: string;
  candidateName: string;
  currentEmail: string;
  canManage: boolean;
  interviewKits: InterviewKit[];
  onUpdated: () => void;
}) {
  const [scoreOpened, setScoreOpened] = useState(false);
  const [editOpened, setEditOpened] = useState(false);
  const [notesOpened, setNotesOpened] = useState(false);
  const [cancelOpened, setCancelOpened] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const mine = interview.scorecards.find(
    (scorecard) => scorecard.interviewerEmail === currentEmail,
  );
  const isAssigned = interview.interviewerEmails.includes(currentEmail);
  const meetingUrl = safeWebUrl(interview.meetingLink);
  // "Write scorecard" on the home page lands here with the form already open.
  const requestedScorecard = useSearchParams().get('scorecard') === interview.id;
  useEffect(() => {
    if (requestedScorecard && isAssigned && !mine) setScoreOpened(true);
    // Only on arrival; closing the form must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedScorecard]);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/api/interviews/${interview.id}`, interviewPayload(interview, status)),
    onSuccess: () => {
      onUpdated();
      toast.success('Interview updated');
    },
    onError: (error: Error) => toast.error('Could not update the interview', error.message),
  });
  const summaryMutation = useMutation({
    mutationFn: () =>
      api.post<{ summary: string }>('/api/ai/summarize-interview', { interviewId: interview.id }),
    onSuccess: (result) => setSummary(result.summary),
    onError: (error: Error) => toast.error('Could not summarize the notes', error.message),
  });
  const calendarTone =
    interview.calendarStatus === 'Created'
      ? 'green'
      : interview.calendarStatus === 'Failed'
        ? 'red'
        : 'gray';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3.5">
          <IconDisc icon={CalendarDays} tone="violet" size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-fg">{interview.title}</h3>
              <StatusBadge status={interview.status} />
              {canManage && (
                <Badge tone={calendarTone} size="sm">
                  {CALENDAR[interview.calendarStatus] ??
                    `Calendar ${humanize(interview.calendarStatus).toLowerCase()}`}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {formatDateTime(interview.startsAt)}–
              {new Date(interview.endsAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {interview.timeZone}
            </p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {interview.interviewerEmails.join(', ')}
            </p>
            {meetingUrl && (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Join ${interview.title} (opens in a new tab)`}
                className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
              >
                Join meeting
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {interview.status !== 'Cancelled' && (
            <InterviewQuestions
              applicationId={applicationId}
              interviewKitId={interview.interviewKitId}
              candidateName={candidateName}
            />
          )}
          {isAssigned && !mine && interview.status !== 'Cancelled' && (
            <Button size="sm" onClick={() => setScoreOpened(true)}>
              Write scorecard
            </Button>
          )}
          {canManage && (
            <Menu modal={false}>
              <MenuTrigger asChild>
                <IconButton label={`Options for ${interview.title}`} size="sm">
                  <MoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => setEditOpened(true)}>Reschedule or edit</MenuItem>
                <MenuItem onSelect={() => statusMutation.mutate('Completed')}>
                  Mark completed
                </MenuItem>
                <MenuItem onSelect={() => statusMutation.mutate('NoShow')}>Mark no-show</MenuItem>
                <MenuItem danger onSelect={() => setCancelOpened(true)}>
                  Cancel interview
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      {interview.interviewKitInstructions && (
        <div className="mt-5 rounded-lg bg-muted p-4">
          <p className="text-xs font-medium text-fg-subtle">Interviewer instructions</p>
          <p className="mt-1 text-base text-fg">{interview.interviewKitInstructions}</p>
        </div>
      )}

      {interview.criteria.length > 0 && (
        <ul className="mt-5 space-y-2">
          {interview.criteria.map((criterion) => (
            <li key={criterion.id} className="rounded-lg border border-border-subtle p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-fg">{criterion.name}</p>
                <span className="text-xs text-fg-subtle tnum">Weight {criterion.weight}</span>
              </div>
              <p className="mt-1 text-sm text-fg">{criterion.question}</p>
              {criterion.description && (
                <p className="mt-0.5 text-xs text-fg-subtle">
                  What good looks like: {criterion.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 rounded-lg bg-muted p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <IconDisc icon={NotebookPen} tone="blue" size="sm" />
            <div>
              <p className="text-sm font-semibold text-fg">Meeting notes</p>
              {canManage && (
                <p className="text-xs text-fg-subtle">
                  Summarize writes an AI draft for you to check.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Button
                size="xs"
                variant="soft"
                leftIcon={<Sparkles />}
                loading={summaryMutation.isPending}
                onClick={() => summaryMutation.mutate()}
              >
                Summarize
              </Button>
            )}
            {(isAssigned || canManage) && (
              <Button size="xs" variant="secondary" onClick={() => setNotesOpened(true)}>
                {interview.meetingNotes ? 'Edit notes' : 'Add notes'}
              </Button>
            )}
          </div>
        </div>
        {interview.meetingNotes ? (
          <>
            <p className="mt-4 text-xs text-fg-subtle">
              {interview.meetingNotesSource ?? 'Meeting assistant'}
              {interview.meetingNotesUpdatedAt
                ? ` · Updated ${formatDateTime(interview.meetingNotesUpdatedAt)}`
                : ''}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-fg">
              {interview.meetingNotes}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-fg-subtle">
            No meeting notes yet. Add your own, or a meeting assistant can add them later.
          </p>
        )}
        {summary && <AiSummary text={summary} />}
      </div>

      <InterviewRecorder
        interview={interview}
        canRecord={isAssigned || canManage}
        canDelete={canManage}
        onUpdated={onUpdated}
      />
      {canManage && <RecordingTranscripts interview={interview} onUpdated={onUpdated} />}

      {isAssigned && !mine && interview.submittedScorecards > 0 && (
        <p className="mt-4 text-xs text-fg-subtle">
          You can see other scorecards after you submit yours.
        </p>
      )}
      {interview.scorecards.length > 0 && (
        <div className="mt-5 space-y-3">
          {interview.scorecards.map((scorecard) => (
            <article key={scorecard.id} className="rounded-lg border border-border-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={scorecard.interviewerEmail} size="sm" />
                  <p className="truncate text-sm font-semibold text-fg">
                    {scorecard.interviewerEmail}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ScoreValue value={scorecard.rating} label="Overall" />
                  <RecommendationBadge recommendation={scorecard.recommendation} />
                </div>
              </div>
              <p className="mt-3 text-base text-fg">{scorecard.evidence}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <p className="text-sm text-fg-muted">
                  <span className="font-semibold text-fg">Strengths:</span> {scorecard.strengths}
                </p>
                <p className="text-sm text-fg-muted">
                  <span className="font-semibold text-fg">Concerns:</span> {scorecard.concerns}
                </p>
              </div>
              {scorecard.criteria.length > 0 && (
                <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                  {scorecard.criteria.map((criterion) => (
                    <li
                      key={criterion.criterionId}
                      className="flex items-start justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg">{criterion.criterionName}</p>
                        <p className="text-sm text-fg-muted">{criterion.evidence}</p>
                      </div>
                      <ScoreValue value={criterion.rating} label={criterion.criterionName} />
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      <ScorecardModal
        interviewId={interview.id}
        interviewTitle={interview.title}
        candidateName={candidateName}
        criteria={interview.criteria}
        opened={scoreOpened}
        onClose={() => setScoreOpened(false)}
        onSaved={onUpdated}
      />
      <InterviewModal
        applicationId={applicationId}
        interviewKits={interviewKits}
        interview={interview}
        opened={editOpened}
        onClose={() => setEditOpened(false)}
        onSaved={onUpdated}
      />
      <MeetingNotesModal
        interview={interview}
        opened={notesOpened}
        onClose={() => setNotesOpened(false)}
        onSaved={onUpdated}
      />
      <ConfirmDialog
        opened={cancelOpened}
        onClose={() => setCancelOpened(false)}
        title="Cancel this interview?"
        confirmLabel="Yes, cancel interview"
        message="The calendar invite is cancelled for everyone on it."
        onConfirm={() =>
          statusMutation.mutateAsync('Cancelled').then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </Card>
  );
}

function interviewPayload(interview: Interview, status: string) {
  return {
    title: interview.title,
    interviewKitId: interview.interviewKitId ?? null,
    startsAt: interview.startsAt,
    endsAt: interview.endsAt,
    timeZone: interview.timeZone,
    meetingLink: interview.meetingLink ?? null,
    interviewerEmails: interview.interviewerEmails,
    status,
  };
}
