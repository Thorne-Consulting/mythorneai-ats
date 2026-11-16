'use client';

import { AssessmentResultsCard } from '@/features/assessments/AssessmentResultsCard';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Flag, Lock, Pin, PinOff, Plus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { RichText } from '@/components/rich-text';
import { useCurrentUser } from '@/auth';
import { StatusBadge } from '@/components/status';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  CopyButton,
  MenuItem,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { DecideControls } from '@/features/approvals/ApprovalParts';
import { DocumentRequestsCard } from '@/features/candidate-portal/staff/DocumentRequests';
import { cn } from '@/lib/cn';
import { whenText } from '@/features/messages/inbox-format';
import { formatDate, formatDateTime } from '@/lib/format';
import { LoadError, useApplication, useInvalidateApplication } from './application-data';
import { useApplicationExtras } from './application-extras';
import { nameFor, type ApplicationData, type Interview } from './application-types';
import { NoteModal } from './NoteModal';
import { liveOffer, useOffer, type OfferResponse } from './offer-data';
import { competencyGrid, daysSince, oneDecimal, scoreTone, tallyText } from './scorecard-math';

const started = (interview: Interview) =>
  ['Scheduled', 'Completed'].includes(interview.status) &&
  new Date(interview.startsAt).getTime() < Date.now();

/** The Overview tab: a one-screen briefing on this person, with contact details in the rail. */
export function ApplicationRecord({ id }: { id: string }) {
  const query = useApplication(id);
  const offer = useOffer(id);
  const invalidate = useInvalidateApplication(id);
  const [noteOpened, setNoteOpened] = useState(false);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const data = query.data;
  const application = data.application;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <NextStep id={id} data={data} offer={offer.data} />
        <FeedbackSummary id={id} data={data} />
        <AssessmentResultsCard applicationId={id} />
        {data.answers.length > 0 && (
          <Card>
            <CardHeader title="Application answers" />
            <dl className="divide-y divide-border-subtle border-t border-border-subtle">
              {data.answers.map((item) => (
                <div key={item.question} className="px-5 py-4">
                  <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                    {item.question}
                    {item.flagged && (
                      <Badge tone="red" icon={<Flag />}>
                        Flagged answer
                      </Badge>
                    )}
                  </dt>
                  <dd className="mt-1 text-base whitespace-pre-wrap break-words text-fg-muted">
                    {item.answer || <span className="text-fg-subtle">No answer</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
        <ResumeCard data={data} />
        {/* The API shows document requests to the people who change this job. */}
        {data.canManage && (
          <DocumentRequestsCard applicationId={id} canEdit={application.status === 'Active'} />
        )}
        <Card id="notes">
          <CardHeader
            title="Team notes"
            description="The candidate never sees these."
            action={
              data.canManage && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus />}
                  onClick={() => setNoteOpened(true)}
                >
                  Add note
                </Button>
              )
            }
          />
          {application.notes.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-fg-subtle">
              Nothing yet. Notes about the job and this person go here.
            </p>
          ) : (
            <NoteList id={id} data={data} />
          )}
        </Card>
      </div>

      <aside className="space-y-5" aria-label="Applicant details">
        <ApplicantCard data={data} />
        <NextInterview id={id} interviews={application.interviews} />
        <OfferChip id={id} offer={offer.data} />
      </aside>

      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={() => setNoteOpened(false)}
        onSaved={invalidate}
      />
    </div>
  );
}

/** Team notes, pinned ones first. Anyone who manages the job can pin a note to the top. */
function NoteList({ id, data }: { id: string; data: ApplicationData }) {
  const invalidate = useInvalidateApplication(id);
  const pin = useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) =>
      pinned ? api.put(`/api/notes/${noteId}/pin`, {}) : api.delete(`/api/notes/${noteId}/pin`),
    onSuccess: (_, { pinned }) => {
      invalidate();
      toast.success(pinned ? 'Note pinned to the top' : 'Note unpinned');
    },
    onError: (error: Error) => toast.error('Could not change the note', error.message),
  });
  const notes = [...data.application.notes].sort(
    (a, b) =>
      Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {notes.map((note) => (
        <li
          key={note.id}
          className={cn('flex gap-3 px-5 py-4', note.pinnedAt && 'bg-tone-amber-bg/40')}
        >
          <Avatar name={nameFor(data.people, note.authorEmail)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
              {note.pinnedAt && (
                <span className="flex items-center gap-1 font-medium text-tone-amber-fg">
                  <Pin className="size-3" aria-hidden />
                  Pinned ·
                </span>
              )}
              <span className="font-medium text-fg-muted">
                {nameFor(data.people, note.authorEmail)}
              </span>
              · {formatDateTime(note.createdAt)}
              {note.editedAt && ' · edited'}
              {!note.applicationId && ' · about the person'}
            </p>
            <RichText markdown={note.body} className="mt-1 text-base break-words text-fg" />
          </div>
          {data.canManage && (
            <RowActions label="Note actions">
              <MenuItem
                icon={note.pinnedAt ? <PinOff /> : <Pin />}
                onSelect={() => pin.mutate({ noteId: note.id, pinned: !note.pinnedAt })}
              >
                {note.pinnedAt ? 'Unpin' : 'Pin to the top'}
              </MenuItem>
            </RowActions>
          )}
        </li>
      ))}
    </ul>
  );
}

type Step = { text: string; action?: ReactNode };

/** The one thing most worth doing next, in priority order. */
function NextStep({
  id,
  data,
  offer,
}: {
  id: string;
  data: ApplicationData;
  offer?: OfferResponse;
}) {
  const user = useCurrentUser();
  const { messages } = useApplicationExtras(id);
  const application = data.application;
  const firstName = application.candidateName.split(' ')[0];
  const live = liveOffer(offer);
  const go = (href: string, label: string) => (
    <Button asChild variant="secondary" size="sm">
      <Link href={href}>
        {label}
        <ArrowRight />
      </Link>
    </Button>
  );

  const myApproval = offer?.approvals.find((item) => item.canDecide);
  const owed = application.interviews.find(
    (interview) =>
      interview.interviewerEmails.includes(user.email) &&
      started(interview) &&
      !interview.scorecards.some((card) => card.interviewerEmail === user.email),
  );
  const finished = application.interviews.filter(started);
  const upcoming = application.interviews.some(
    (interview) =>
      !['Cancelled', 'NoShow'].includes(interview.status) &&
      new Date(interview.startsAt).getTime() > Date.now(),
  );
  const allIn =
    finished.length > 0 &&
    !upcoming &&
    finished.every(
      (interview) => interview.submittedScorecards >= interview.interviewerEmails.length,
    );
  const unbooked = application.interviews.find(
    (interview) =>
      interview.status === 'Proposed' &&
      data.interviewsCreatedAt?.[interview.id] &&
      daysSince(data.interviewsCreatedAt[interview.id]) >= 3,
  );
  const unread = messages.filter((message) => message.fromCandidate && !message.readAt).length;
  const active = application.status === 'Active';
  // An email set to go out later (a rejection or a stage email): it can still be taken back.
  const later = data.emails?.find(
    (email) =>
      email.status === 'Pending' &&
      ['rejection', 'stage-update'].includes(email.templateKey ?? '') &&
      email.nextAttemptAt &&
      new Date(email.nextAttemptAt).getTime() > Date.now() + 2 * 60_000,
  );

  const step: Step | null = myApproval
    ? {
        text: `The offer for ${firstName} is waiting for your approval.`,
        action: (
          <DecideControls
            approvalId={myApproval.id}
            subject={`the offer for ${firstName}`}
            size="sm"
          />
        ),
      }
    : owed
      ? {
          text: `Your scorecard for ${owed.title} is due.`,
          action: go(`/applications/${id}/scorecards?interview=${owed.id}`, 'Write scorecard'),
        }
      : data.canManage && later
        ? {
            text: `${later.templateKey === 'rejection' ? 'The rejection email' : 'The stage email'} to ${firstName} goes out ${whenText(later.nextAttemptAt!)}.`,
            action: <CancelEmail applicationId={id} emailId={later.id} />,
          }
        : data.canManage && live?.status === 'Expired'
          ? {
              text: `The offer closed before ${firstName} answered.`,
              action: go(`/applications/${id}/offer`, 'Open offer'),
            }
          : data.canManage && live?.status === 'Approved'
            ? {
                text: `The offer is approved. Send it to ${firstName} when you are ready.`,
                action: go(`/applications/${id}/offer`, 'Open offer'),
              }
            : data.canManage && active && allIn && application.decisions.length === 0 && !live
              ? {
                  text: 'All feedback is in. Record what the team decided.',
                  action: go(`/applications/${id}/scorecards#decision`, 'Record decision'),
                }
              : data.canManage && active && unbooked
                ? {
                    text: `${firstName} has not picked a time for ${unbooked.title} in ${daysSince(data.interviewsCreatedAt![unbooked.id])} days.`,
                    action: go(`/applications/${id}/interviews`, 'View interview'),
                  }
                : data.canManage && unread > 0
                  ? {
                      text: `${firstName} sent ${unread === 1 ? 'a message' : `${unread} messages`} you have not read.`,
                      action: go(`/applications/${id}/messages`, 'Read and reply'),
                    }
                  : null;

  if (!step) return null;
  return <Alert tone="info" title={step.text} action={step.action} />;
}

function CancelEmail({ applicationId, emailId }: { applicationId: string; emailId: string }) {
  const invalidate = useInvalidateApplication(applicationId);
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/applications/${applicationId}/emails/${emailId}/cancel`),
    onSuccess: () => {
      invalidate();
      toast.success('The email will not be sent');
    },
    onError: (error: Error) => toast.error('Could not cancel the email', error.message),
  });
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={cancel.isPending}
      onClick={() => cancel.mutate()}
    >
      Cancel email
    </Button>
  );
}

function FeedbackSummary({ id, data }: { id: string; data: ApplicationData }) {
  const interviews = data.application.interviews.filter(
    (interview) => !['Cancelled', 'Proposed'].includes(interview.status),
  );
  if (interviews.length === 0) return null;
  const href = `/applications/${id}/scorecards`;
  const header = (
    <CardHeader title="Feedback" action={<CardLink href={href}>Open feedback</CardLink>} />
  );

  if (data.blinded)
    return (
      <Card>
        {header}
        <CardBody className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-base text-fg-muted">
            Submit your scorecard for {data.blindedBy[0]} to see what the panel thinks. Until then
            your scores stay your own.
          </p>
        </CardBody>
      </Card>
    );

  const due = interviews.filter(started);
  const expected = due.reduce((sum, interview) => sum + interview.interviewerEmails.length, 0);
  const submitted = interviews.reduce((sum, interview) => sum + interview.submittedScorecards, 0);
  const cards = interviews.flatMap((interview) => interview.scorecards);
  const grid = competencyGrid(interviews).filter((row) => row.average !== null);
  const missing = Math.max(0, expected - submitted);

  return (
    <Card>
      {header}
      <CardBody className="space-y-4">
        {cards.length === 0 ? (
          <p className="text-base text-fg-muted">
            {due.length === 0
              ? 'No interview has happened yet. Scorecards show here after each one.'
              : 'No scorecards yet. Interviewers are reminded automatically.'}
          </p>
        ) : (
          <div>
            <p className="text-md font-semibold text-fg">
              {tallyText(cards.map((c) => c.recommendation))}
            </p>
            <p className="mt-0.5 text-sm text-fg-subtle">
              {submitted} of {Math.max(expected, submitted)} scorecards in
              {missing > 0 ? ` · ${missing} still to come` : ''}
            </p>
          </div>
        )}
        {grid.length > 0 && (
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {grid.map((row) => (
              <li key={row.name} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{row.name}</span>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <span
                    className={cn('block h-full rounded-full', toneBar[scoreTone(row.average!)])}
                    style={{ width: `${(row.average! / 5) * 100}%` }}
                  />
                </span>
                <span className="w-7 text-right text-sm font-semibold text-fg tnum">
                  {oneDecimal(row.average!)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

const toneBar = {
  red: 'bg-tone-red-dot',
  amber: 'bg-tone-amber-dot',
  green: 'bg-tone-green-dot',
} as const;

function ResumeCard({ data }: { data: ApplicationData }) {
  const resume = data.application.resume;
  const href = `/candidates/${data.application.candidateId}/resume`;
  const empty = !resume.summary && resume.skills.length === 0 && resume.experience.length === 0;
  if (empty && !resume.hasResume) return null;
  return (
    <Card>
      <CardHeader
        title="Resume"
        description={
          resume.yearsExperience
            ? `${oneDecimal(resume.yearsExperience).replace('.0', '')} years of experience`
            : undefined
        }
        action={
          resume.hasResume && (
            <Button asChild variant="secondary" size="sm" leftIcon={<FileText />}>
              <Link href={href}>Open resume</Link>
            </Button>
          )
        }
      />
      <CardBody className="space-y-4">
        {empty && (
          <p className="text-base text-fg-muted">
            We have not read this resume yet. Open it to see the file.
          </p>
        )}
        {resume.summary && <p className="text-base text-fg">{resume.summary}</p>}
        {resume.experience.length > 0 && (
          <ul className="space-y-2">
            {resume.experience.map((job, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-fg">{job.title}</span>
                  <span className="text-fg-muted"> · {job.company}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-subtle tnum">
                  {job.startYear ?? ''}
                  {job.startYear && '–'}
                  {job.isCurrent ? 'now' : (job.endYear ?? '')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {resume.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {resume.skills.slice(0, 10).map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
            {resume.skills.length > 10 && (
              <Badge tone="gray">{resume.skills.length - 10} more</Badge>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <dt className="shrink-0 text-sm text-fg-subtle">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right text-sm text-fg">{children}</dd>
    </div>
  );
}

function ApplicantCard({ data }: { data: ApplicationData }) {
  const application = data.application;
  // Interviewers see "Restricted" instead of the email.
  const email = application.candidateEmail.includes('@') ? application.candidateEmail : null;
  return (
    <Card>
      <CardHeader
        title="Applicant"
        action={<CardLink href={`/candidates/${application.candidateId}`}>Profile</CardLink>}
      />
      <CardBody className="space-y-3">
        <dl className="space-y-1">
          <Row label="Email">
            {email ? (
              <>
                <a
                  href={`mailto:${email}`}
                  className="truncate text-accent-foreground hover:underline"
                >
                  {email}
                </a>
                <CopyButton value={email} label="Copy email" />
              </>
            ) : (
              <span className="text-fg-subtle">Hidden</span>
            )}
          </Row>
          <Row label="Phone">
            {application.candidatePhone ? (
              <>
                <span className="truncate tnum">{application.candidatePhone}</span>
                <CopyButton value={application.candidatePhone} label="Copy phone" />
              </>
            ) : (
              <span className="text-fg-subtle">Not set</span>
            )}
          </Row>
          <Row label="Source">{application.source}</Row>
          <Row label="Applied">{formatDate(application.appliedAt)}</Row>
        </dl>
        {application.candidateTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
            {application.candidateTags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function NextInterview({ id, interviews }: { id: string; interviews: Interview[] }) {
  const now = Date.now();
  const next = interviews
    .filter(
      (item) =>
        !['Cancelled', 'Completed', 'NoShow', 'Proposed'].includes(item.status) &&
        new Date(item.endsAt).getTime() > now,
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  return (
    <Card>
      <CardHeader
        title="Next interview"
        action={
          <CardLink href={`/applications/${id}/interviews`}>
            {next ? 'View' : 'All interviews'}
          </CardLink>
        }
      />
      <CardBody>
        {next ? (
          <>
            <p className="text-base font-medium text-fg">{next.title}</p>
            <p className="text-sm text-fg-muted">
              {formatDateTime(next.startsAt)}–
              {new Date(next.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-subtle">Nothing scheduled.</p>
        )}
      </CardBody>
    </Card>
  );
}

/** The single offer summary on the record. The Offer tab holds everything else. */
function OfferChip({ id, offer }: { id: string; offer?: OfferResponse }) {
  const current = offer?.offer;
  if (!current || current.status === 'Withdrawn') return null;
  return (
    <Card className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">Offer</h2>
        <Link
          href={`/applications/${id}/offer`}
          className="text-sm text-accent-foreground hover:underline"
        >
          Open offer
        </Link>
      </div>
      <StatusBadge status={current.status} />
    </Card>
  );
}
