'use client';

import { Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import {
  canManageRole,
  LoadError,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { InterviewCard } from './InterviewCard';
import { InterviewModal } from './InterviewModal';

export function ApplicationInterviews({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [interviewOpened, interviewModal] = useDisclosure();
  const canManage = canManageRole(user.role);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={3} />;
  const application = query.data.application;
  // The person who came here to run an interview sees theirs first.
  const orderedInterviews = [...application.interviews].sort((a, b) => {
    const mine =
      Number(b.interviewerEmails.includes(user.email)) -
      Number(a.interviewerEmails.includes(user.email));
    if (mine !== 0) return mine;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  return (
    <>
      {canManage && application.interviews.length > 0 && (
        <Group justify="flex-end" mb="md">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={14} />}
            onClick={interviewModal.open}
          >
            Schedule interview
          </Button>
        </Group>
      )}
      <Stack>
        {orderedInterviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            applicationId={id}
            candidateName={application.candidateName}
            currentEmail={user.email}
            canManage={canManage}
            interviewKits={application.interviewKits}
            onUpdated={invalidate}
          />
        ))}
        {application.interviews.length === 0 && (
          <div className="panel empty-row">
            <Text size="sm" c="dimmed">
              No interviews yet. Scheduling the first one starts structured feedback.
            </Text>
            {canManage && (
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={interviewModal.open}>
                Schedule interview
              </Button>
            )}
          </div>
        )}
      </Stack>
      <InterviewModal
        applicationId={id}
        interviewKits={application.interviewKits}
        opened={interviewOpened}
        onClose={interviewModal.close}
        onSaved={invalidate}
      />
    </>
  );
}
