'use client';

import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Rating,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarEvent, IconDots, IconNotes } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { RecommendationBadge, StatusBadge } from '@/components/ui/Badges';
import { formatDateTime, humanize } from '@/lib/format';
import type { InterviewKit } from '@/types';
import type { Interview } from './application-types';
import { InterviewModal } from './InterviewModal';
import { InterviewRecorder } from './InterviewRecorder';
import { MeetingNotesModal } from './MeetingNotesModal';
import { ScorecardModal } from './ScorecardModal';

function ScoreValue({ value, label }: { value: number; label: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Rating value={value} readOnly size="xs" aria-hidden />
      <Text size="sm" fw={650} className="tnum" aria-label={`${label}: ${value} out of 5`}>
        {value}/5
      </Text>
    </Group>
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
  const [scoreOpened, scoreModal] = useDisclosure();
  const [editOpened, editModal] = useDisclosure();
  const [notesOpened, notesModal] = useDisclosure();
  const mine = interview.scorecards.find(
    (scorecard) => scorecard.interviewerEmail === currentEmail,
  );
  const isAssigned = interview.interviewerEmails.includes(currentEmail);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/api/interviews/${interview.id}`, interviewPayload(interview, status)),
    onSuccess: onUpdated,
  });
  return (
    <Paper withBorder radius="lg" p="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group align="flex-start" wrap="nowrap" style={{ flex: '1 1 320px', minWidth: 0 }}>
          <ThemeIcon variant="light" color="violet" size={42}>
            <IconCalendarEvent size={20} />
          </ThemeIcon>
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="wrap">
              <Title order={4}>{interview.title}</Title>
              <StatusBadge status={interview.status} />
              <Badge
                size="xs"
                variant="light"
                color={
                  interview.calendarStatus === 'Created'
                    ? 'teal'
                    : interview.calendarStatus === 'Failed'
                      ? 'red'
                      : 'gray'
                }
              >
                Calendar {humanize(interview.calendarStatus).toLowerCase()}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              {formatDateTime(interview.startsAt)}–
              {new Date(interview.endsAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {interview.timeZone}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {interview.interviewerEmails.join(', ')}
            </Text>
            {interview.meetingLink && (
              <Anchor
                size="sm"
                href={interview.meetingLink}
                target="_blank"
                rel="noreferrer"
                aria-label={`Join ${interview.title} (opens in a new tab)`}
              >
                Join meeting
              </Anchor>
            )}
          </div>
        </Group>
        <Group gap="sm">
          {isAssigned && !mine && interview.status !== 'Cancelled' && (
            <Button size="sm" onClick={scoreModal.open}>
              Submit scorecard
            </Button>
          )}
          {canManage && (
            <Menu>
              <Menu.Target>
                <ActionIcon variant="default" aria-label={`Options for ${interview.title}`}>
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={editModal.open}>Reschedule or edit</Menu.Item>
                <Menu.Item onClick={() => statusMutation.mutate('Completed')}>
                  Mark completed
                </Menu.Item>
                <Menu.Item onClick={() => statusMutation.mutate('NoShow')}>Mark no-show</Menu.Item>
                <Menu.Item color="red" onClick={() => statusMutation.mutate('Cancelled')}>
                  Cancel interview
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
      {interview.interviewKitInstructions && (
        <Paper radius="md" p="md" mt="lg" bg="var(--surface-sunken)">
          <Text size="xs" fw={500} c="dimmed" mb={4}>
            Interviewer instructions
          </Text>
          <Text size="sm">{interview.interviewKitInstructions}</Text>
        </Paper>
      )}
      {interview.criteria.length > 0 && (
        <Stack gap="xs" mt="lg">
          {interview.criteria.map((criterion) => (
            <Paper key={criterion.id} p="sm" radius="sm" bg="var(--surface-sunken)">
              <Group justify="space-between">
                <Text fw={650} size="sm">
                  {criterion.name}
                </Text>
                <Text size="xs" c="dimmed">weight {criterion.weight}</Text>
              </Group>
              <Text size="sm" mt={4}>
                {criterion.question}
              </Text>
              {criterion.description && (
                <Text size="xs" c="dimmed">
                  What good looks like: {criterion.description}
                </Text>
              )}
            </Paper>
          ))}
        </Stack>
      )}
      <Paper radius="md" p="md" mt="lg" bg="var(--surface-sunken)">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon variant="light" color="indigo" size={32}>
              <IconNotes size={16} />
            </ThemeIcon>
            <div>
              <Text fw={650} size="sm">
                Meeting notes
              </Text>
              <Text size="xs" c="dimmed">
                AI-generated notes and interview transcripts live here.
              </Text>
            </div>
          </Group>
          {(isAssigned || canManage) && (
            <Button size="xs" variant="light" onClick={notesModal.open}>
              {interview.meetingNotes ? 'Edit notes' : 'Add notes'}
            </Button>
          )}
        </Group>
        {interview.meetingNotes ? (
          <>
            <Text size="xs" c="dimmed" mt="md">
              {interview.meetingNotesSource ?? 'Meeting assistant'}
              {interview.meetingNotesUpdatedAt
                ? ` · Updated ${formatDateTime(interview.meetingNotesUpdatedAt)}`
                : ''}
            </Text>
            <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
              {interview.meetingNotes}
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed" mt="md">
            No meeting notes yet. Paste notes now, or let a meeting assistant add them later.
          </Text>
        )}
      </Paper>
      <InterviewRecorder
        interview={interview}
        canRecord={isAssigned || canManage}
        canDelete={canManage}
        onUpdated={onUpdated}
      />
      {isAssigned && !mine && interview.submittedScorecards > 0 && (
        <Text size="xs" c="dimmed" mt="md">
          Other feedback stays hidden until you submit yours.
        </Text>
      )}
      {interview.scorecards.length > 0 && (
        <Stack mt="lg">
          {interview.scorecards.map((scorecard) => (
            <Paper key={scorecard.id} withBorder radius="md" p="md">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Text fw={650} size="sm">
                  {scorecard.interviewerEmail}
                </Text>
                <Group gap="sm">
                  <ScoreValue value={scorecard.rating} label="Overall" />
                  <RecommendationBadge recommendation={scorecard.recommendation} />
                </Group>
              </Group>
              <Text size="sm" mt="sm">
                {scorecard.evidence}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                <Text size="sm">
                  <b>Strengths:</b> {scorecard.strengths}
                </Text>
                <Text size="sm">
                  <b>Concerns:</b> {scorecard.concerns}
                </Text>
              </SimpleGrid>
              {scorecard.criteria.map((criterion) => (
                <Group
                  key={criterion.criterionId}
                  justify="space-between"
                  mt="sm"
                  gap="md"
                  wrap="nowrap"
                >
                  <div>
                    <Text size="sm" fw={650}>
                      {criterion.criterionName}
                    </Text>
                    <Text size="sm">{criterion.evidence}</Text>
                  </div>
                  <ScoreValue value={criterion.rating} label={criterion.criterionName} />
                </Group>
              ))}
            </Paper>
          ))}
        </Stack>
      )}
      <ScorecardModal
        interviewId={interview.id}
        interviewTitle={interview.title}
        candidateName={candidateName}
        criteria={interview.criteria}
        opened={scoreOpened}
        onClose={scoreModal.close}
        onSaved={onUpdated}
      />
      <InterviewModal
        applicationId={applicationId}
        interviewKits={interviewKits}
        interview={interview}
        opened={editOpened}
        onClose={editModal.close}
        onSaved={onUpdated}
      />
      <MeetingNotesModal
        interview={interview}
        opened={notesOpened}
        onClose={notesModal.close}
        onSaved={onUpdated}
      />
    </Paper>
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
