'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, NotebookPen, Pencil, Sparkles, Video } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { RecommendationBadge } from '@/components/status';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  CopyButton,
  EmptyState,
  Input,
  Modal,
  Rating,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { AiSummary } from '@/features/applications/AiSummary';
import { InterviewRecorder } from '@/features/applications/InterviewRecorder';
import { MeetingNotesModal } from '@/features/applications/MeetingNotesModal';
import { ScorecardForm } from '@/features/applications/ScorecardForm';
import { formatDateTime } from '@/lib/format';
import { TabNotice, useInterviewRecord } from './InterviewRecord';
import { RecordingPlayer } from './RecordingPlayer';
import { recordingsOf } from './interview-api';
import { useMyNotes } from './interview-notes';

/** Record (or upload), then play back with the searchable transcript; the shared meeting notes below. */
export function InterviewRecordingTab() {
  const { interview, candidate, people, canManage, assigned, refresh } = useInterviewRecord();
  const recordings = recordingsOf(interview);
  // Who a speaker can be: the panel, then the candidate.
  const speakerChoices = [
    ...interview.interviewerEmails.map((email) => people[email]?.name ?? email),
    `${candidate.name} (candidate)`,
  ];
  // Keep the page current while a recording is saved and transcribed.
  const working = recordings.some(
    (item) =>
      item.status === 'Processing' ||
      item.transcriptStatus === 'Queued' ||
      item.transcriptStatus === 'Running',
  );
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [working, refresh]);
  return (
    <div className="space-y-5">
      <InterviewRecorder
        interviewId={interview.id}
        canRecord={assigned || canManage}
        onUpdated={refresh}
      />
      {recordings.length === 0 && !(assigned || canManage) ? (
        <Card>
          <EmptyState
            compact
            icon={Video}
            title="No recordings yet"
            description="Recordings show here once someone on the panel saves one."
          />
        </Card>
      ) : (
        recordings.map((recording) => (
          <RecordingPlayer
            key={recording.id}
            interviewId={interview.id}
            recording={recording}
            canSeeTranscript={interview.notesVisible}
            canManage={canManage}
            canName={canManage || assigned}
            people={speakerChoices}
            onUpdated={refresh}
          />
        ))
      )}
      {interview.notesVisible ? (
        <MeetingNotes />
      ) : (
        <Card>
          <EmptyState
            compact
            icon={Lock}
            title="Notes and transcripts open after your scorecard"
            description="So nothing shapes your view, send your scorecard first. Then you can read what others wrote."
            action={
              <Button asChild variant="soft" size="sm">
                <Link href={`/interviews/${interview.id}/feedback`}>Write scorecard</Link>
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

function MeetingNotes() {
  const { interview, canManage, submitted, refresh } = useInterviewRecord();
  const [opened, setOpened] = useState(false);
  const canEdit = canManage || submitted;
  return (
    <Card>
      <CardHeader
        title="Meeting notes"
        description="Notes or a transcript pasted from another tool, shared with the hiring team."
        action={
          canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setOpened(true)}>
              {interview.meetingNotes ? 'Edit notes' : 'Add notes'}
            </Button>
          )
        }
      />
      <CardBody>
        {interview.meetingNotes ? (
          <>
            <p className="text-xs text-fg-subtle">
              {interview.meetingNotesSource ?? 'Added by hand'}
              {interview.meetingNotesUpdatedAt
                ? ` · Updated ${formatDateTime(interview.meetingNotesUpdatedAt)}`
                : ''}
            </p>
            <p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-fg">
              {interview.meetingNotes}
            </p>
          </>
        ) : (
          <EmptyState
            compact
            icon={NotebookPen}
            title="No meeting notes yet"
            description="Paste notes from Fireflies, Otter or another note taker, or type your own."
          />
        )}
      </CardBody>
      <MeetingNotesModal
        interview={interview}
        opened={opened}
        onClose={() => setOpened(false)}
        onSaved={refresh}
      />
    </Card>
  );
}

type SavedSummary = {
  summary: {
    id: string;
    body: string;
    sources: string;
    reason?: string | null;
    createdBy: string;
    createdAt: string;
    editedBy?: string | null;
    editedAt?: string | null;
  } | null;
  versions: number;
  canWrite: boolean;
  locked: boolean;
  aiReady: boolean;
};

/**
 * The saved AI summary: written on its own when a transcript is ready, or on request. Times in it
 * jump to that moment of the recording. The people who run the job can edit it or write it again.
 */
export function InterviewSummaryTab() {
  const { interview, people } = useInterviewRecord();
  const queryClient = useQueryClient();
  const key = ['interview-summary', interview.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<SavedSummary>(`/api/interviews/${interview.id}/summary`),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const [reason, setReason] = useState('');
  const write = useMutation({
    mutationFn: () =>
      api.post(`/api/interviews/${interview.id}/summary`, { reason: reason.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      setAgain(false);
      setReason('');
      toast.success('Summary written');
    },
    onError: (error: Error) => toast.error('Could not write the summary', error.message),
  });
  const save = useMutation({
    mutationFn: (body: string) => api.put(`/api/interviews/${interview.id}/summary`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      setEditing(null);
      toast.success('Summary saved');
    },
    onError: (error: Error) => toast.error('Could not save the summary', error.message),
  });
  const data = query.data;
  if (query.isLoading || !data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  if (data.locked)
    return (
      <TabNotice
        title="The summary opens after your scorecard"
        description="So nothing shapes your view, send your scorecard first."
      />
    );
  const summary = data.summary;
  const nameOf = (email: string) =>
    email.startsWith('system:') ? 'MyThorneAI' : (people[email]?.name ?? email);
  return (
    <Card>
      <CardHeader
        title="AI summary"
        description={
          summary
            ? `Written by AI from ${summary.sources}, ${formatDateTime(summary.createdAt)}${summary.editedBy ? `. Edited by ${nameOf(summary.editedBy)}` : ''}.`
            : undefined
        }
        action={
          data.canWrite &&
          editing === null && (
            <div className="flex gap-2">
              {summary && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Pencil />}
                  onClick={() => setEditing(summary.body)}
                >
                  Edit
                </Button>
              )}
              {data.aiReady && (
                <Button
                  size="sm"
                  variant="soft"
                  leftIcon={<Sparkles />}
                  loading={write.isPending}
                  onClick={() => (summary ? setAgain(true) : write.mutate())}
                >
                  {summary ? 'Write it again' : 'Write summary'}
                </Button>
              )}
            </div>
          )
        }
      />
      <CardBody>
        {editing !== null ? (
          <div className="space-y-3">
            <Textarea
              aria-label="Summary"
              minRows={14}
              value={editing}
              onChange={(event) => setEditing(event.currentTarget.value)}
            />
            <p className="text-xs text-fg-subtle">
              Write times as [12:34] to link to that moment of the recording.
            </p>
            <div className="flex gap-2">
              <Button
                loading={save.isPending}
                disabled={!editing.trim()}
                onClick={() => save.mutate(editing)}
              >
                Save summary
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : summary ? (
          <AiSummary
            text={summary.body}
            timeHref={(seconds) => `/interviews/${interview.id}/recording?t=${seconds}`}
            note="Written by AI. It never says whether to hire. Check it against the recording and scorecards."
          />
        ) : (
          <EmptyState
            compact
            icon={Sparkles}
            title="No summary yet"
            description={
              !data.aiReady
                ? 'Summaries need AI to be set up. Ask your administrator.'
                : recordingsOf(interview).some(
                      (x) => x.transcriptStatus === 'Queued' || x.transcriptStatus === 'Running',
                    )
                  ? 'It is written on its own once the transcript is ready.'
                  : 'Record the interview, or add meeting notes or a scorecard, then write one.'
            }
          />
        )}
        {data.versions > 1 && (
          <p className="mt-3 text-xs text-fg-subtle tnum">
            {data.versions} versions written. This is the newest.
          </p>
        )}
      </CardBody>
      <Modal
        opened={again}
        onClose={() => setAgain(false)}
        dismissable={!write.isPending}
        title="Write the summary again?"
        description="The current one is kept as an older version."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAgain(false)}>
              Cancel
            </Button>
            <Button loading={write.isPending} onClick={() => write.mutate()}>
              Write it again
            </Button>
          </>
        }
      >
        <Input
          label="Why? (optional)"
          placeholder="For example, a new scorecard came in"
          maxLength={300}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </Modal>
    </Card>
  );
}

/** Your scorecard for this interview, then the panel's once yours is in. */
export function InterviewFeedbackTab() {
  const user = useCurrentUser();
  const { interview, assigned, submitted, state, people, blindedBy, refresh } =
    useInterviewRecord();
  const started = !['upcoming', 'waiting', 'cancelled'].includes(state.key);
  const owes = assigned && !submitted && started && state.key !== 'noshow';
  const visible = interview.scorecards;
  const nameOf = (email: string) => people[email]?.name ?? email;
  return (
    <div className="space-y-5">
      {owes && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ScorecardForm
            applicationId={interview.applicationId}
            interview={interview}
            onDone={refresh}
          />
          <NotesBeside />
        </div>
      )}
      {assigned && !submitted && !started && (
        <TabNotice
          title="Your scorecard opens when the interview starts"
          description="Look over the questions on the Overview tab before then."
        />
      )}
      <Card>
        <CardHeader
          title="Scorecards"
          description={`${interview.submittedScorecards} of ${interview.interviewerEmails.length} in`}
          action={
            <CardLink href={`/applications/${interview.applicationId}/scorecards`}>
              Compare the panel
            </CardLink>
          }
        />
        {blindedBy.length > 0 && interview.submittedScorecards > 0 && visible.length === 0 ? (
          <EmptyState
            compact
            icon={Lock}
            title="Others’ scorecards open after you send yours"
            description="So nothing shapes your view. Send your scorecard to read the panel’s."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={NotebookPen}
            title="No scorecards yet"
            description={
              started
                ? 'Interviewers get a reminder to send theirs.'
                : 'Interviewers write theirs after the interview.'
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-t border-border-subtle">
            {visible.map((card) => (
              <li key={card.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={nameOf(card.interviewerEmail)} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-fg">
                        {nameOf(card.interviewerEmail)}
                        {card.interviewerEmail === user.email && (
                          <span className="font-normal text-fg-subtle"> (you)</span>
                        )}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        Sent {formatDateTime(card.submittedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1.5"
                      aria-label={`Overall: ${card.rating} out of 5`}
                    >
                      <span aria-hidden>
                        <Rating value={card.rating} readOnly size="sm" />
                      </span>
                      <span className="text-sm font-semibold text-fg tnum" aria-hidden>
                        {card.rating}/5
                      </span>
                    </span>
                    <RecommendationBadge recommendation={card.recommendation} />
                  </div>
                </div>
                <p className="text-base text-fg">{card.evidence}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <p className="text-sm text-fg-muted">
                    <span className="font-semibold text-fg">Strengths:</span> {card.strengths}
                  </p>
                  <p className="text-sm text-fg-muted">
                    <span className="font-semibold text-fg">Concerns:</span> {card.concerns}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** My notes from the room, beside the scorecard, each ready to copy into it. */
function NotesBeside() {
  const { interview } = useInterviewRecord();
  const notes = useMyNotes(interview.id);
  const named = notes.items
    .filter((item) => item.body.trim())
    .map((item) => ({
      label: item.criterionId
        ? (interview.criteria.find((c) => c.id === item.criterionId)?.name ?? 'Question')
        : (item.question ?? 'Other notes'),
      body: item.body,
    }));
  return (
    <Card className="lg:sticky lg:top-[101px]">
      <CardHeader title="Your notes" description="Only you see these." />
      <CardBody className="space-y-3">
        {notes.loading ? (
          <SkeletonRows rows={3} className="p-0" />
        ) : named.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            You took no notes in the room. Notes you take there show here, by question.
          </p>
        ) : (
          named.map((note, index) => (
            <section key={index} className="rounded-lg border border-border-subtle p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg-muted">{note.label}</h3>
                <CopyButton value={note.body} label={`Copy your note on ${note.label}`} />
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap text-fg">{note.body}</p>
            </section>
          ))
        )}
      </CardBody>
    </Card>
  );
}
