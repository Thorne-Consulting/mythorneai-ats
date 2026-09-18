'use client';

import { useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Divider,
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
  formatDate,
  formatDateTime,
  initials,
  LoadingBlock,
  StatusBadge,
} from '../components/Common';
import type { ApplicationDetailResponse, InterviewCriterion, InterviewKit } from '../types';

type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };
type Interview = ApplicationDetailResponse['application']['interviews'][number];

export function ApplicationDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${id}`),
    refetchInterval: (current) =>
      current.state.data?.application.interviews.some((item) =>
        ['Queued', 'RetryScheduled', 'CancellationQueued'].includes(item.calendarStatus),
      )
        ? 2000
        : false,
  });
  const [noteOpened, noteModal] = useDisclosure();
  const [interviewOpened, interviewModal] = useDisclosure();
  const [rejectOpened, rejectModal] = useDisclosure();
  const canManage = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['application', id] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['applicants'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
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

  if (!query.data) return <LoadingBlock />;
  const application = query.data.application;
  return (
    <div>
      <Breadcrumbs mb="lg" separator="/">
        <Link href={`/requisitions/${application.requisitionId}`} className="quiet-link">
          {application.requisitionCode}
        </Link>
        <Text size="sm" c="dimmed">
          {application.candidateName}
        </Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start" mb="xl">
        <Group align="flex-start" wrap="nowrap">
          <Avatar size={58} radius="xl" color="indigo" variant="light">
            {initials(application.candidateName)}
          </Avatar>
          <div>
            <Group gap="sm">
              <Title order={1} fz={{ base: 27, sm: 34 }}>
                {application.candidateName}
              </Title>
              <StatusBadge status={application.status} />
            </Group>
            <Text c="dimmed" mt={4}>
              {application.candidateTitle ?? 'Applicant'} · {application.requisitionTitle}
            </Text>
          </div>
        </Group>
        {canManage && (
          <Group>
            <Select
              value={application.stageId}
              onChange={(value) => value && stageMutation.mutate(value)}
              data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
              w={160}
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
          </Group>
        )}
      </Group>
      <Tabs defaultValue="record">
        <Tabs.List mb="xl">
          <Tabs.Tab value="record">Applicant record</Tabs.Tab>
          <Tabs.Tab value="interviews">
            Interviews{' '}
            <Badge ml={6} size="xs" variant="light" circle>
              {application.interviews.length}
            </Badge>
          </Tabs.Tab>
          <Tabs.Tab value="activity">History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="record">
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl">
            <Paper withBorder radius="lg" p="lg">
              <Text fw={700} mb="md">
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
            <Paper withBorder radius="lg" style={{ gridColumn: 'span 2' }}>
              <Group justify="space-between" p="lg">
                <div>
                  <Text fw={700}>Review notes</Text>
                  <Text size="sm" c="dimmed">
                    Job-related facts and decision context
                  </Text>
                </div>
                {canManage && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={noteModal.open}
                  >
                    Add note
                  </Button>
                )}
              </Group>
              <Divider />
              <Stack gap={0}>
                {application.notes.map((note) => (
                  <Box key={note.id} className="list-row">
                    <Group justify="space-between" mb={5}>
                      <Text size="sm" fw={650}>
                        {note.authorEmail}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDateTime(note.createdAt)}
                      </Text>
                    </Group>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {note.body}
                    </Text>
                  </Box>
                ))}
                {application.notes.length === 0 && (
                  <Text p="xl" c="dimmed">
                    No review notes yet.
                  </Text>
                )}
              </Stack>
            </Paper>
          </SimpleGrid>
        </Tabs.Panel>
        <Tabs.Panel value="interviews">
          <Group justify="space-between" mb="lg">
            <div>
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
              <Paper withBorder p="xl">
                <Text c="dimmed">No interviews scheduled.</Text>
              </Paper>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="activity">
          <Paper withBorder p="xl">
            <Timeline bulletSize={28} lineWidth={2}>
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
        </Tabs.Panel>
      </Tabs>
      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={noteModal.close}
        onSaved={invalidate}
      />
      <InterviewModal
        applicationId={id}
        interviewKits={application.interviewKits}
        opened={interviewOpened}
        onClose={interviewModal.close}
        onSaved={invalidate}
      />
      <RejectModal
        applicationId={id}
        stageId={application.stageId}
        opened={rejectOpened}
        onClose={rejectModal.close}
        onSaved={invalidate}
      />
    </div>
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
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <ThemeIcon variant="light" color="violet" size={42}>
            <IconCalendarEvent size={20} />
          </ThemeIcon>
          <div>
            <Group gap="sm">
              <Text fw={700}>{interview.title}</Text>
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
                Calendar {interview.calendarStatus}
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
        <Group>
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
            <Paper key={criterion.id} bg="gray.0" p="sm">
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
            <Paper key={scorecard.id} withBorder p="md">
              <Group justify="space-between">
                <Text fw={650}>{scorecard.interviewerEmail}</Text>
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
    </Paper>
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
    <Paper withBorder p="md" mt="lg">
      <Group justify="space-between">
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
        <Group key={item.id} justify="space-between" align="flex-end" mt="md">
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
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Structured evaluation</Title>}
      size="lg"
    >
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
      title={<Title order={3}>{interview ? 'Edit interview' : 'Schedule interview'}</Title>}
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
