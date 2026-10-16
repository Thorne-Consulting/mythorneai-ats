'use client';

import { Button, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight, IconPlus } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
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
  const [noteOpened, noteModal] = useDisclosure();
  const canManage = canManageRole(user.role);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={3} />;
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
        text: `You owe a scorecard for ${owed.title}.`,
        action: 'Write scorecard',
        href: `/applications/${id}/interviews?scorecard=${owed.id}`,
      }
    : canManage && unread > 0
      ? {
          text: `${firstName} sent ${unread === 1 ? 'a message' : `${unread} messages`} you haven't read.`,
          action: 'Read and reply',
          href: `/applications/${id}/messages`,
        }
      : null;

  return (
    <>
      <Stack gap={48}>
        {next && (
          <div className="next-step" role="status">
            <Text className="next-step-text" fw={600}>
              {next.text}
            </Text>
            <Button
              component="a"
              href={next.href}
              size="sm"
              rightSection={<IconArrowRight size={15} />}
            >
              {next.action}
            </Button>
          </div>
        )}

        <section id="notes" className="record-section">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Team notes</h2>
              {canManage && (
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconPlus size={14} />}
                  onClick={noteModal.open}
                >
                  Add note
                </Button>
              )}
            </div>
            {application.notes.length === 0 ? (
              <Text c="dimmed" size="sm" p={24}>
                No notes yet. Notes stay inside the team; the candidate never sees them.
              </Text>
            ) : (
              <ul className="rows" style={{ paddingTop: 4 }}>
                {application.notes.map((note) => (
                  <li key={note.id}>
                    <div className="row" style={{ alignItems: 'flex-start', paddingBlock: 12 }}>
                      <span className="row-main">
                        <span className="row-meta">
                          {note.authorEmail} · {formatDateTime(note.createdAt)}
                        </span>
                        <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                          {note.body}
                        </Text>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="acceptance" className="record-section">
          <OfferPanel
            applicationId={id}
            applicationStatus={application.status}
            candidateName={application.candidateName}
            canManage={canManage}
          />
        </section>
      </Stack>
      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={noteModal.close}
        onSaved={invalidate}
      />
    </>
  );
}
