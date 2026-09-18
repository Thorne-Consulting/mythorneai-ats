'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Menu,
  Modal,
  Paper,
  Rating,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarEvent,
  IconClock,
  IconCopy,
  IconDots,
  IconNotes,
  IconPlayerRecord,
  IconPlayerStop,
  IconPlus,
  IconTrash,
  IconUserOff,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCurrentUser } from '../auth';
import { api } from '../api';
import {
  DetailHeader,
  EmptyState,
  formatDate,
  formatDateTime,
  humanize,
  initials,
  LoadingBlock,
  PageTabs,
  SectionCard,
  StatusBadge,
} from '../components/Common';
import type { ApplicationDetailResponse, InterviewCriterion, InterviewKit } from '../types';

type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };
type Interview = ApplicationDetailResponse['application']['interviews'][number];

function useApplication(id: string) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${id}`),
    refetchInterval: (current) =>
      current.state.data?.application.interviews.some((item) =>
        ['Queued', 'RetryScheduled', 'CancellationQueued'].includes(item.calendarStatus),
      )
        ? 2000
        : false,
  });
}

function useInvalidateApplication(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['application', id] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['applicants'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

const canManageRole = (role: string) => ['Admin', 'Recruiter', 'HiringManager'].includes(role);

/** Candidate header, stage control, and section links shared by every application route. */
export function ApplicationShell({ id, children }: { id: string; children: React.ReactNode }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [rejectOpened, rejectModal] = useDisclosure();
  const canManage = canManageRole(user.role);
  const stageMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.patch<void>(`/api/applications/${id}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ color: 'teal', message: 'Applicant moved' });
    },
  });

  if (!query.data) return <LoadingBlock rows={5} />;
  const application = query.data.application;

  return (
    <>
      <DetailHeader
        backHref={`/requisitions/${application.requisitionId}`}
        backLabel={application.requisitionCode}
        current={application.candidateName}
        avatar={
          <Avatar size={56} radius="xl" color="indigo" variant="light">
            {initials(application.candidateName)}
          </Avatar>
        }
        title={application.candidateName}
        badges={<StatusBadge status={application.status} />}
        subtitle={`${application.candidateTitle ?? 'Applicant'} · ${application.requisitionTitle}`}
        actions={
          canManage && (
            <>
              <Select
                aria-label="Current stage"
                value={application.stageId}
                onChange={(value) => value && stageMutation.mutate(value)}
                data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                w={170}
                allowDeselect={false}
                disabled={stageMutation.isPending}
              />
              <Button
                color="red"
                variant="light"
                leftSection={<IconUserOff size={16} />}
                onClick={rejectModal.open}
              >
                Reject
              </Button>
            </>
          )
        }
      />
      <PageTabs
        items={[
          { label: 'Overview', href: `/applications/${id}` },
          {
            label: 'Interviews',
            href: `/applications/${id}/interviews`,
            count: application.interviews.length,
          },
          { label: 'History', href: `/applications/${id}/history`, count: query.data.audit.length },
        ]}
      />
      {children}
      <RejectModal
        applicationId={id}
        stageId={application.stageId}
        opened={rejectOpened}
        onClose={rejectModal.close}
        onSaved={invalidate}
      />
    </>
  );
}

export function ApplicationRecord({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [noteOpened, noteModal] = useDisclosure();
  const canManage = canManageRole(user.role);

  if (!query.data) return <LoadingBlock rows={3} />;
  const application = query.data.application;

  return (
    <>
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder radius="lg" p="lg" h="100%">
            <Text fw={650} mb="md">
              Applicant
            </Text>
            <Stack gap="sm">
              <Pair label="Email" value={application.candidateEmail} />
              <Pair label="Phone" value={application.candidatePhone ?? '—'} />
              <Pair label="Location" value={application.candidateLocation ?? '—'} />
              <Pair label="Source" value={application.source} />
              <Pair label="Applied" value={formatDate(application.appliedAt)} />
            </Stack>
            {application.candidateTags.length > 0 && (
              <Group gap={6} mt="md">
                {application.candidateTags.map((tag) => (
                  <Badge key={tag} variant="light" color="gray">
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}
            <Button
              component={Link}
              href={`/candidates/${application.candidateId}`}
              variant="light"
              fullWidth
              mt="lg"
            >
              Open resumes and full record
            </Button>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SectionCard
            title="Review notes"
            description="Job-related facts and decision context"
            action={
              canManage && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={noteModal.open}
                >
                  Add note
                </Button>
              )
            }
          >
            <Stack gap={0}>
              {application.notes.map((note) => (
                <Box key={note.id} className="list-row">
                  <Group justify="space-between" mb={5} wrap="nowrap">
                    <Text size="sm" fw={650} truncate>
                      {note.authorEmail}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(note.createdAt)}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {note.body}
                  </Text>
                </Box>
              ))}
              {application.notes.length === 0 && (
                <Text p="xl" c="dimmed" size="sm">
                  No review notes yet.
                </Text>
              )}
            </Stack>
          </SectionCard>
        </Grid.Col>
      </Grid>
      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={noteModal.close}
        onSaved={invalidate}
      />
    </>
  );
}

export function ApplicationInterviews({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [interviewOpened, interviewModal] = useDisclosure();
  const canManage = canManageRole(user.role);

  if (!query.data) return <LoadingBlock rows={3} />;
  const application = query.data.application;

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
        {application.interviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            applicationId={id}
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

export function ApplicationHistory({ id }: { id: string }) {
  const query = useApplication(id);
  if (!query.data) return <LoadingBlock rows={3} />;

  return (
    <>
      {query.data.audit.length === 0 ? (
        <EmptyState
          icon={IconClock}
          title="No recorded history yet"
          description="Stage changes, notes, and interview decisions appear here as they happen."
        />
      ) : (
        <Paper withBorder radius="lg" p="xl">
          <Timeline bulletSize={26} lineWidth={2}>
            {query.data.audit.map((event) => (
              <Timeline.Item
                key={event.id}
                bullet={<IconClock size={14} />}
                title={event.action.replace(/([a-z])([A-Z])/g, '$1 $2')}
              >
                <Text c="dimmed" size="sm">
                  {event.actorEmail}
                </Text>
                <Text size="xs" mt={4}>
                  {formatDateTime(event.occurredAt)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      )}
    </>
  );
}

function InterviewCard({
  interview,
  applicationId,
  currentEmail,
  canManage,
  interviewKits,
  onUpdated,
}: {
  interview: Interview;
  applicationId: string;
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
              <Text fw={650}>{interview.title}</Text>
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
              <Anchor size="xs" href={interview.meetingLink} target="_blank">
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
                <ActionIcon variant="default">
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
        <Alert color="blue" mt="lg" title="Interviewer instructions">
          {interview.interviewKitInstructions}
        </Alert>
      )}
      {interview.criteria.length > 0 && (
        <Stack gap="xs" mt="lg">
          {interview.criteria.map((criterion) => (
            <Paper key={criterion.id} p="sm" radius="sm" bg="var(--surface-sunken)">
              <Group justify="space-between">
                <Text fw={650} size="sm">
                  {criterion.name}
                </Text>
                <Badge variant="light">Weight {criterion.weight}</Badge>
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
                <Group>
                  <Rating value={scorecard.rating} readOnly size="xs" />
                  <Badge>{scorecard.recommendation}</Badge>
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
                <Group key={criterion.criterionId} justify="space-between" mt="xs">
                  <div>
                    <Text size="xs" fw={650}>
                      {criterion.criterionName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {criterion.evidence}
                    </Text>
                  </div>
                  <Rating value={criterion.rating} readOnly size="xs" />
                </Group>
              ))}
            </Paper>
          ))}
        </Stack>
      )}
      <ScorecardModal
        interviewId={interview.id}
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

function MeetingNotesModal({
  interview,
  opened,
  onClose,
  onSaved,
}: ModalProps & { interview: Interview }) {
  const [notes, setNotes] = useState(interview.meetingNotes ?? '');
  const [source, setSource] = useState(interview.meetingNotesSource ?? '');
  useEffect(() => {
    if (!opened) return;
    setNotes(interview.meetingNotes ?? '');
    setSource(interview.meetingNotesSource ?? '');
  }, [interview.meetingNotes, interview.meetingNotesSource, opened]);
  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/api/interviews/${interview.id}/meeting-notes`, {
        notes,
        source: source.trim() || null,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
      notifications.show({ color: 'teal', message: 'Meeting notes saved' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Meeting notes" size="xl">
      <Stack>
        <TextInput
          label="Generated by"
          description="For example: Fireflies, Fathom, Otter, or manual import"
          value={source}
          maxLength={120}
          onChange={(event) => setSource(event.currentTarget.value)}
        />
        <Textarea
          label="Notes"
          description="Paste the meeting assistant's notes or transcript here."
          autosize
          minRows={14}
          maxRows={24}
          maxLength={100_000}
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!notes.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save notes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function InterviewRecorder({
  interview,
  canRecord,
  canDelete,
  onUpdated,
}: {
  interview: Interview;
  canRecord: boolean;
  canDelete: boolean;
  onUpdated: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) =>
      api.upload(`/api/interviews/${interview.id}/recordings?consentConfirmed=true`, file),
    onSuccess: () => {
      onUpdated();
      notifications.show({ color: 'teal', message: 'Recording saved to the interview record' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/interview-recordings/${id}`),
    onSuccess: () => {
      onUpdated();
      notifications.show({ color: 'teal', message: 'Recording deleted' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const copyLink = async (id: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/api/interview-recordings/${id}`);
    notifications.show({ color: 'teal', message: 'Internal recording link copied' });
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm',
      });
      media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        upload.mutate(
          new File(chunks, `interview-${new Date().toISOString().replaceAll(':', '-')}.webm`, {
            type: 'video/webm',
          }),
        );
        setRecording(false);
      };
      stream.getVideoTracks()[0].onended = () => media.state !== 'inactive' && media.stop();
      recorder.current = media;
      media.start(1000);
      setRecording(true);
    } catch {
      notifications.show({ color: 'red', message: 'Screen recording was not started.' });
    }
  };
  return (
    <Paper radius="md" p="md" mt="md" bg="var(--surface-sunken)">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div>
          <Text fw={650} size="sm">
            Interview recording
          </Text>
          <Text size="xs" c="dimmed">
            Screen and shared audio stay inside this ATS.
          </Text>
        </div>
        {canRecord &&
          (recording ? (
            <Button
              color="red"
              leftSection={<IconPlayerStop size={15} />}
              onClick={() => recorder.current?.stop()}
            >
              Stop and save
            </Button>
          ) : (
            <Button
              variant="light"
              leftSection={<IconPlayerRecord size={15} />}
              disabled={!consent || upload.isPending}
              onClick={start}
            >
              Record interview
            </Button>
          ))}
      </Group>
      {canRecord && !recording && (
        <Checkbox
          mt="sm"
          checked={consent}
          onChange={(event) => setConsent(event.currentTarget.checked)}
          label="Every participant has explicitly agreed to this recording."
        />
      )}
      {interview.recordings.map((item) => (
        <Group key={item.id} justify="space-between" align="flex-end" mt="md" wrap="wrap" gap="sm">
          <video
            controls
            preload="metadata"
            src={`/api/interview-recordings/${item.id}`}
            style={{ width: 'min(100%, 520px)', borderRadius: 8 }}
          />
          <Stack gap={4} align="flex-end">
            <Text size="xs" c="dimmed">
              {formatDateTime(item.recordedAt)} · {Math.ceil(item.length / 1024 / 1024)} MB
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                aria-label="Copy internal recording link"
                onClick={() => copyLink(item.id)}
              >
                <IconCopy size={15} />
              </ActionIcon>
              {canDelete && (
                <ActionIcon
                  color="red"
                  variant="subtle"
                  aria-label="Delete recording"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  <IconTrash size={15} />
                </ActionIcon>
              )}
            </Group>
          </Stack>
        </Group>
      ))}
    </Paper>
  );
}

function ScorecardModal({
  interviewId,
  criteria,
  opened,
  onClose,
  onSaved,
}: ModalProps & { interviewId: string; criteria: InterviewCriterion[] }) {
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [values, setValues] = useState<Record<string, { rating: number; evidence: string }>>({});
  const complete = criteria.every(
    (criterion) => values[criterion.id]?.rating && values[criterion.id]?.evidence.trim(),
  );
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/interviews/${interviewId}/scorecards`, {
        rating,
        recommendation,
        evidence,
        strengths,
        concerns,
        criteria: criteria.map((criterion) => ({
          criterionId: criterion.id,
          rating: values[criterion.id]?.rating ?? 0,
          evidence: values[criterion.id]?.evidence ?? '',
        })),
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const update = (id: string, next: Partial<{ rating: number; evidence: string }>) =>
    setValues((current) => ({
      ...current,
      [id]: { rating: current[id]?.rating ?? 0, evidence: current[id]?.evidence ?? '', ...next },
    }));
  return (
    <Modal opened={opened} onClose={onClose} title="Structured evaluation" size="lg">
      <Stack>
        <Alert>
          Your independent scorecard is locked after submission. Other feedback stays hidden until
          then.
        </Alert>
        {criteria.map((criterion) => (
          <Paper key={criterion.id} withBorder p="md">
            <Group justify="space-between">
              <Text fw={700}>{criterion.name}</Text>
              <Badge>Weight {criterion.weight}</Badge>
            </Group>
            <Text size="sm" mt="xs">
              {criterion.question}
            </Text>
            {criterion.description && (
              <Text size="xs" c="dimmed">
                Scoring guidance: {criterion.description}
              </Text>
            )}
            <Rating
              mt="sm"
              value={values[criterion.id]?.rating ?? 0}
              onChange={(value) => update(criterion.id, { rating: value })}
            />
            <Textarea
              label="Observed evidence"
              minRows={2}
              mt="sm"
              value={values[criterion.id]?.evidence ?? ''}
              onChange={(event) => update(criterion.id, { evidence: event.currentTarget.value })}
            />
          </Paper>
        ))}
        <Group>
          <div>
            <Text size="sm" fw={500}>
              Overall rating
            </Text>
            <Rating value={rating} onChange={setRating} size="lg" />
          </div>
          <Select
            label="Recommendation"
            value={recommendation}
            onChange={setRecommendation}
            data={[
              ['StrongNo', 'Strong no'],
              ['No', 'No'],
              ['Mixed', 'Mixed'],
              ['Yes', 'Yes'],
              ['StrongYes', 'Strong yes'],
            ].map(([value, label]) => ({ value, label }))}
            style={{ flex: 1 }}
          />
        </Group>
        <Textarea
          label="Decision summary"
          minRows={3}
          value={evidence}
          onChange={(event) => setEvidence(event.currentTarget.value)}
        />
        <Textarea
          label="Demonstrated strengths"
          minRows={2}
          value={strengths}
          onChange={(event) => setStrengths(event.currentTarget.value)}
        />
        <Textarea
          label="Risks or concerns"
          description="Enter “None observed” when appropriate."
          minRows={2}
          value={concerns}
          onChange={(event) => setConcerns(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !rating ||
              !recommendation ||
              !evidence.trim() ||
              !strengths.trim() ||
              !concerns.trim() ||
              !complete
            }
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Submit and lock
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function InterviewModal({
  applicationId,
  interviewKits,
  interview,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string; interviewKits: InterviewKit[]; interview?: Interview }) {
  const [title, setTitle] = useState(interview?.title ?? 'Interview');
  const [kitId, setKitId] = useState<string | null>(interview?.interviewKitId ?? null);
  const [startsAt, setStartsAt] = useState(interview ? localDateTime(interview.startsAt) : '');
  const [endsAt, setEndsAt] = useState(interview ? localDateTime(interview.endsAt) : '');
  const [interviewers, setInterviewers] = useState(interview?.interviewerEmails.join(', ') ?? '');
  const [meetingLink, setMeetingLink] = useState(interview?.meetingLink ?? '');
  const payload = () => ({
    title,
    interviewKitId: kitId,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    meetingLink: meetingLink || null,
    interviewerEmails: interviewers
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    status: interview?.status ?? 'Scheduled',
  });
  const mutation = useMutation({
    mutationFn: () =>
      interview
        ? api.patch(`/api/interviews/${interview.id}`, payload())
        : api.post(`/api/applications/${applicationId}/interviews`, payload()),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const selectKit = (value: string | null) => {
    setKitId(value);
    const kit = interviewKits.find((item) => item.id === value);
    if (kit) setTitle(kit.name);
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={interview ? 'Edit interview' : 'Schedule interview'}
    >
      <Stack>
        <Select
          label="Interview kit"
          placeholder="Choose a structured kit"
          clearable
          value={kitId}
          onChange={selectKit}
          data={interviewKits.map((kit) => ({
            value: kit.id,
            label: `${kit.name} · ${kit.durationMinutes} min`,
          }))}
        />
        <TextInput
          label="Interview name"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <SimpleGrid cols={2}>
          <TextInput
            type="datetime-local"
            label="Starts"
            value={startsAt}
            onChange={(event) => setStartsAt(event.currentTarget.value)}
          />
          <TextInput
            type="datetime-local"
            label="Ends"
            value={endsAt}
            onChange={(event) => setEndsAt(event.currentTarget.value)}
          />
        </SimpleGrid>
        <TextInput
          label="Interviewers"
          description="Comma-separated work emails"
          value={interviewers}
          onChange={(event) => setInterviewers(event.currentTarget.value)}
        />
        <TextInput
          label="Meeting link"
          description="Leave blank to create Teams or Google Meet when configured."
          value={meetingLink}
          onChange={(event) => setMeetingLink(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title || !startsAt || !endsAt || !interviewers}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {interview ? 'Save and sync' : 'Schedule'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function NoteModal({
  applicationId,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string }) {
  const [body, setBody] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/applications/${applicationId}/notes`, { body, isPrivate: false }),
    onSuccess: () => {
      setBody('');
      onSaved();
      onClose();
    },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add review note">
      <Stack>
        <Textarea
          label="Job-related note"
          minRows={6}
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!body.trim()} onClick={() => mutation.mutate()}>
            Add note
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
function RejectModal({
  applicationId,
  stageId,
  opened,
  onClose,
  onSaved,
}: ModalProps & { applicationId: string; stageId: string }) {
  const [reason, setReason] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Rejected',
        dispositionReason: reason,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Reject applicant">
      <Stack>
        <Select
          label="Disposition reason"
          value={reason}
          onChange={setReason}
          data={[
            'Does not meet minimum requirements',
            'Skills mismatch',
            'Experience mismatch',
            'Compensation mismatch',
            'Location or availability',
            'Withdrew',
            'Position closed',
            'Other',
          ]}
        />
        <Alert color="orange">
          Use job-related reasons only. This decision is recorded in the audit history.
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" disabled={!reason} onClick={() => mutation.mutate()}>
            Reject applicant
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
function Pair({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600} ta="right">
        {value}
      </Text>
    </Group>
  );
}
function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
