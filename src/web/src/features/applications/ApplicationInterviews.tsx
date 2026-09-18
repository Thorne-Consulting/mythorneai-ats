'use client';

import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarEvent, IconPlus } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { EmptyState } from '@/components/ui/Cards';
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
      <Group justify="space-between" mb="lg" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 260px' }}>
          <Title order={3}>Interview plan</Title>
          <Text c="dimmed" size="sm">
            Scheduling, recordings, structured evaluations, and independent feedback
          </Text>
        </div>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={interviewModal.open}>
            Schedule interview
          </Button>
        )}
      </Group>
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
          <EmptyState
            icon={IconCalendarEvent}
            title="No interviews scheduled"
            description="Schedule the first interview to start collecting structured feedback."
            actionLabel={canManage ? 'Schedule interview' : undefined}
            onAction={interviewModal.open}
          />
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
