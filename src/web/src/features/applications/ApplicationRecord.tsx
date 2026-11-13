'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { Alert, Avatar, Button, Card, CardHeader, SkeletonRows } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  canManageRole,
  LoadError,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { useApplicationExtras } from './application-extras';
import { NoteModal } from './NoteModal';
import { OfferPanel } from './OfferPanel';

/** The Overview tab: what to do next, the team's notes, and the acceptance. */
export function ApplicationRecord({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const { messages } = useApplicationExtras(id);
  const invalidate = useInvalidateApplication(id);
  const [noteOpened, setNoteOpened] = useState(false);
  const canManage = canManageRole(user.role);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const application = query.data.application;
  const firstName = application.candidateName.split(' ')[0];

  // The single most useful thing to do here, if there is one.
  const owed = application.interviews.find(
    (interview) =>
      interview.interviewerEmails.includes(user.email) &&
      ['Scheduled', 'Completed'].includes(interview.status) &&
      new Date(interview.startsAt) < new Date() &&
      !interview.scorecards.some((card) => card.interviewerEmail === user.email),
  );
  const unread = messages.filter((message) => message.fromCandidate && !message.readAt).length;
  const next = owed
    ? {
        text: `Your scorecard for ${owed.title} is due.`,
        action: 'Write scorecard',
        href: `/applications/${id}/scorecards?interview=${owed.id}`,
      }
    : canManage && unread > 0
      ? {
          text: `${firstName} sent ${unread === 1 ? 'a message' : `${unread} messages`} you haven't read.`,
          action: 'Read and reply',
          href: `/applications/${id}/messages`,
        }
      : null;

  return (
    <div className="space-y-5">
      {next && (
        <Alert
          tone="info"
          title={next.text}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={next.href}>
                {next.action}
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      )}

      <Card id="notes">
        <CardHeader
          title="Team notes"
          description="The candidate never sees these notes."
          action={
            canManage && (
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
          <p className="px-5 pb-5 text-sm text-fg-subtle">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle border-t border-border-subtle">
            {application.notes.map((note) => (
              <li key={note.id} className="flex gap-3 px-5 py-4">
                <Avatar name={note.authorEmail} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg-subtle">
                    <span className="font-medium text-fg-muted">{note.authorEmail}</span> ·{' '}
                    {formatDateTime(note.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-base text-fg">
                    {note.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section id="acceptance" className="scroll-mt-20">
        <OfferPanel
          applicationId={id}
          applicationStatus={application.status}
          candidateName={application.candidateName}
          canManage={canManage}
        />
      </section>

      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={() => setNoteOpened(false)}
        onSaved={invalidate}
      />
    </div>
  );
}
