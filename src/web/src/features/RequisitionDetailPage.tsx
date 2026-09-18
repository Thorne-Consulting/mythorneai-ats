'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Rating,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarEvent,
  IconClipboardList,
  IconDots,
  IconMapPin,
  IconPlus,
  IconTargetArrow,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import {
  DetailHeader,
  EmptyState,
  formatDate,
  formatDateTime,
  initials,
  LoadingBlock,
  PageTabs,
  SectionCard,
  StatusBadge,
} from '../components/Common';
import type { BoardData, RequisitionDetail } from '../types';

type BoardApplication = BoardData['stages'][number]['applications'][number];
import { useCurrentUser } from '../auth';

function useRequisition(id: string) {
  return useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${id}`),
  });
}

function useBoard(id: string) {
  return useQuery({
    queryKey: ['board', id],
    queryFn: () => api.get<BoardData>(`/api/requisitions/${id}/board`),
  });
}

function useCanManage(requisition?: RequisitionDetail) {
  const user = useCurrentUser();
  return (
    ['Admin', 'Recruiter'].includes(user.role) ||
    (user.role === 'HiringManager' && requisition?.ownerEmail === user.email)
  );
}

/** Job header, key facts, and section links shared by every job route. */
export function RequisitionShell({ id, children }: { id: string; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const details = useRequisition(id);
  const board = useBoard(id);
  const canManage = useCanManage(details.data);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job status updated' });
    },
  });

  if (!details.data) return <LoadingBlock rows={5} />;
  const requisition = details.data;
  const totalActive =
    board.data?.stages.reduce((sum, stage) => sum + stage.applications.length, 0) ?? 0;

  return (
    <>
      <DetailHeader
        backHref="/requisitions"
        backLabel="Jobs"
        current={requisition.code}
        title={requisition.title}
        badges={<StatusBadge status={requisition.status} />}
        subtitle={`${requisition.code} · ${requisition.department}`}
        actions={
          canManage && (
            <Select
              aria-label="Job status"
              value={requisition.status}
              onChange={(value) => value && statusMutation.mutate(value)}
              data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
              w={160}
              allowDeselect={false}
            />
          )
        }
      />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="xl">
        <InfoCard
          icon={IconMapPin}
          label="Location"
          value={requisition.location}
          hint={requisition.workMode}
        />
        <InfoCard
          icon={IconTargetArrow}
          label="Openings"
          value={`${requisition.openings} ${requisition.openings === 1 ? 'seat' : 'seats'}`}
          hint={requisition.employmentType}
        />
        <InfoCard
          icon={IconUser}
          label="Hiring manager"
          value={requisition.ownerEmail.split('@')[0]}
          hint={requisition.ownerEmail}
        />
        <InfoCard
          icon={IconCalendarEvent}
          label="Target start"
          value={formatDate(requisition.targetStartDate)}
          hint={requisition.targetStartDate ? 'Planned start date' : 'Not set'}
        />
      </SimpleGrid>

      <PageTabs
        items={[
          { label: 'Pipeline', href: `/requisitions/${id}`, count: totalActive },
          {
            label: 'Interview kits',
            href: `/requisitions/${id}/kits`,
            count: requisition.interviewKits.length,
          },
          { label: 'Details', href: `/requisitions/${id}/details` },
        ]}
      />
      {children}
    </>
  );
}

export function RequisitionPipeline({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const details = useRequisition(id);
  const board = useBoard(id);
  const canManage = useCanManage(details.data);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const moveMutation = useMutation({
    mutationFn: ({ applicationId, stageId }: { applicationId: string; stageId: string }) =>
      api.patch<void>(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    // Move the card in the cache first so a drag lands instantly, and put it
    // back if the request fails.
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['board', id] });
      const previous = queryClient.getQueryData<BoardData>(['board', id]);
      queryClient.setQueryData<BoardData>(['board', id], (current) => {
        if (!current) return current;
        let moved: BoardApplication | undefined;
        const emptied = current.stages.map((stage) => ({
          ...stage,
          applications: stage.applications.filter((application) => {
            if (application.id !== applicationId) return true;
            moved = application;
            return false;
          }),
        }));
        if (!moved) return current;
        return {
          ...current,
          stages: emptied.map((stage) =>
            stage.id === stageId
              ? { ...stage, applications: [moved as BoardApplication, ...stage.applications] }
              : stage,
          ),
        };
      });
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['board', id], context.previous);
      notifications.show({ color: 'red', message: error.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
  });

  const moveTo = (stageId: string) => {
    const active = dragging;
    setDragging(null);
    setDropStage(null);
    if (!active || active.from === stageId) return;
    moveMutation.mutate({ applicationId: active.id, stageId });
  };

  if (!board.data) return <LoadingBlock rows={3} />;
  const totalActive = board.data.stages.reduce((sum, s) => sum + s.applications.length, 0);

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap" gap="sm">
        <div>
          <Title order={3}>Hiring pipeline</Title>
          <Text c="dimmed" size="sm">
            {totalActive} active across {board.data.stages.length} stages.{' '}
            {canManage && 'Drag a card to another stage, or use the menu on the card.'}
          </Text>
        </div>
      </Group>
      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Box className="pipeline-scroll">
          <div className="pipeline-grid">
            {board.data.stages.map((stage) => (
              <section
                key={stage.id}
                className="pipeline-column"
                data-drop-target={dropStage === stage.id || undefined}
                onDragOver={(event) => {
                  if (!dragging || dragging.from === stage.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropStage(stage.id);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDropStage((current) => (current === stage.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveTo(stage.id);
                }}
              >
                <Group justify="space-between" mb="md" className="pipeline-column-header">
                  <Group gap="xs" wrap="nowrap">
                    <Box className="stage-dot" bg={`${stage.color}.5`} />
                    <Text fw={650} size="sm" truncate>
                      {stage.name}
                    </Text>
                  </Group>
                  <Badge color="gray" variant="light" circle>
                    {stage.applications.length}
                  </Badge>
                </Group>
                <Stack gap="sm">
                  {stage.applications.map((application) => (
                    <Paper
                      key={application.id}
                      withBorder
                      radius="md"
                      p="md"
                      bg="var(--mantine-color-body)"
                      className="hover-card candidate-card"
                      draggable={canManage}
                      data-draggable={canManage || undefined}
                      data-dragging={dragging?.id === application.id || undefined}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', application.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging({ id: application.id, from: stage.id });
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropStage(null);
                      }}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <UnstyledButton
                          style={{ flex: 1, minWidth: 0 }}
                          onClick={() => router.push(`/applications/${application.id}`)}
                        >
                          <Group wrap="nowrap" align="flex-start" gap="sm">
                            <Avatar size={36} color={stage.color} variant="light">
                              {initials(application.candidateName)}
                            </Avatar>
                            <div style={{ minWidth: 0 }}>
                              <Text fw={650} size="sm" truncate>
                                {application.candidateName}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                {application.currentTitle ?? 'Candidate'}
                              </Text>
                            </div>
                          </Group>
                        </UnstyledButton>
                        {canManage && (
                          <Menu position="bottom-end" withArrow>
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label={`Move ${application.candidateName}`}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Label>Move to</Menu.Label>
                              {board.data.stages
                                .filter((target) => target.id !== stage.id)
                                .map((target) => (
                                  <Menu.Item
                                    key={target.id}
                                    onClick={() =>
                                      moveMutation.mutate({
                                        applicationId: application.id,
                                        stageId: target.id,
                                      })
                                    }
                                  >
                                    {target.name}
                                  </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Group>
                      {application.location && (
                        <Group gap={5} mt="sm" wrap="nowrap">
                          <IconMapPin size={13} color="var(--mantine-color-dimmed)" />
                          <Text size="xs" c="dimmed" truncate>
                            {application.location}
                          </Text>
                        </Group>
                      )}
                      {application.rating ? (
                        <Group gap={6} mt={6} wrap="nowrap">
                          <Rating value={application.rating} readOnly size="xs" />
                          <Text size="xs" c="dimmed">
                            {application.rating.toFixed(1)}
                          </Text>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" mt={6}>
                          Not rated yet
                        </Text>
                      )}
                      <Divider my="sm" />
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Badge size="xs" variant="default">
                          {application.source}
                        </Badge>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(application.lastActivityAt)}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
                  {stage.applications.length === 0 && (
                    <Paper withBorder radius="md" p="lg" className="empty-stage">
                      <Text size="xs" c="dimmed" ta="center">
                        No candidates
                      </Text>
                    </Paper>
                  )}
                </Stack>
              </section>
            ))}
          </div>
        </Box>
      </Paper>
    </>
  );
}

export function RequisitionKits({ id }: { id: string }) {
  const [kitOpened, kitModal] = useDisclosure();
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);

  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 280px' }}>
          <Title order={3}>Interview kits</Title>
          <Text c="dimmed" size="sm">
            Shared instructions and scoring criteria every interviewer works from.
          </Text>
        </div>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={kitModal.open}>
            Add kit
          </Button>
        )}
      </Group>
      {requisition.interviewKits.length === 0 ? (
        <EmptyState
          icon={IconClipboardList}
          title="No interview kits yet"
          description="Kits keep every interviewer on the same questions and the same scoring scale, which makes candidates comparable."
          actionLabel={canManage ? 'Add the first kit' : undefined}
          onAction={kitModal.open}
        />
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {requisition.interviewKits.map((kit) => (
            <Paper key={kit.id} withBorder radius="lg" p="lg">
              <Group justify="space-between" wrap="nowrap" mb={kit.instructions ? 'xs' : 'md'}>
                <Text fw={650}>{kit.name}</Text>
                <Badge variant="light" color="gray">
                  {kit.durationMinutes} min
                </Badge>
              </Group>
              {kit.instructions && (
                <Text size="sm" c="dimmed" mb="md">
                  {kit.instructions}
                </Text>
              )}
              <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.6} mb="xs">
                {kit.criteria.length} scored{' '}
                {kit.criteria.length === 1 ? 'competency' : 'competencies'}
              </Text>
              <Stack gap="sm">
                {kit.criteria.map((criterion) => (
                  <Paper key={criterion.id} p="md" radius="md" bg="var(--surface-sunken)">
                    <Group justify="space-between" wrap="nowrap" mb={4}>
                      <Text size="sm" fw={650}>
                        {criterion.name}
                      </Text>
                      <Badge size="xs" variant="light">
                        Weight {criterion.weight}
                      </Badge>
                    </Group>
                    <Text size="sm">{criterion.question}</Text>
                    {criterion.description && (
                      <Text size="xs" c="dimmed" mt={6}>
                        Good looks like: {criterion.description}
                      </Text>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      <InterviewKitModal requisitionId={id} opened={kitOpened} onClose={kitModal.close} />
    </>
  );
}

export function RequisitionDetails({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <Grid gutter="xl">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <SectionCard title="Role summary" padded>
          <Text
            c={requisition.description ? undefined : 'dimmed'}
            style={{ whiteSpace: 'pre-wrap', maxWidth: '68ch' }}
          >
            {requisition.description || 'No role summary has been added.'}
          </Text>
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack gap="xl">
          <SectionCard title="Job details" padded>
            <Stack gap="sm">
              <Field label="Job code" value={requisition.code} />
              <Field label="Team" value={requisition.department} />
              <Field label="Location" value={requisition.location} />
              <Field label="Work mode" value={requisition.workMode} />
              <Field label="Employment type" value={requisition.employmentType} />
              <Field label="Openings" value={String(requisition.openings)} />
              <Field label="Target start" value={formatDate(requisition.targetStartDate)} />
            </Stack>
          </SectionCard>
          <SectionCard title="People and dates" padded>
            <Stack gap="sm">
              <Field label="Hiring manager" value={requisition.ownerEmail} />
              <Field label="Recruiter" value={requisition.recruiterEmail} />
              <Field label="Created" value={formatDate(requisition.createdAt)} />
              <Field label="Last updated" value={formatDateTime(requisition.updatedAt)} />
            </Stack>
          </SectionCard>
          <SectionCard
            title="Pipeline stages"
            description={`${requisition.stages.length} stages in order`}
            padded
          >
            <Group gap="xs">
              {requisition.stages.map((stage, index) => (
                <Badge key={stage.id} variant="light" color={stage.color} leftSection={index + 1}>
                  {stage.name}
                </Badge>
              ))}
            </Group>
          </SectionCard>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

function InterviewKitModal({
  requisitionId,
  opened,
  onClose,
}: {
  requisitionId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number | string>(60);
  const [instructions, setInstructions] = useState('');
  const [criteriaText, setCriteriaText] = useState(
    'Role expertise | Tell me about the most relevant work you have done for this role. | Gives specific examples and explains personal contribution. | 3\nProblem solving | Walk me through a difficult problem and the tradeoffs you made. | Frames the problem, considers alternatives, and measures the result. | 3\nCollaboration | Describe a disagreement with a teammate and how you handled it. | Listens, communicates directly, and reaches a constructive outcome. | 2',
  );
  const criteria = criteriaText
    .split('\n')
    .map((line) => {
      const [criterionName, question, description, weight] = line.split('|');
      return {
        name: criterionName.trim(),
        question: question?.trim() ?? '',
        description: description?.trim() ?? '',
        weight: Math.min(5, Math.max(1, Number(weight?.trim()) || 1)),
      };
    })
    .filter((criterion) => criterion.name);
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${requisitionId}/interview-kits`, {
        name,
        durationMinutes: Number(duration),
        instructions,
        criteria,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      notifications.show({ color: 'teal', message: 'Interview kit created' });
      setName('');
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add interview kit" size="lg" centered>
      <Stack>
        <TextInput
          label="Interview name"
          placeholder="Technical interview"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <NumberInput
          label="Duration in minutes"
          min={15}
          max={480}
          step={15}
          value={duration}
          onChange={setDuration}
        />
        <Textarea
          label="Interviewer instructions"
          minRows={3}
          value={instructions}
          onChange={(event) => setInstructions(event.currentTarget.value)}
        />
        <Textarea
          label="Scorecard criteria"
          description="One per line: competency | exact question | scoring guidance | weight (1–5)."
          minRows={6}
          value={criteriaText}
          onChange={(event) => setCriteriaText(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || criteria.length === 0 || Number(duration) < 15}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Create kit
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof IconMapPin;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color="indigo" size={38} radius="md">
          <Icon size={19} stroke={1.7} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.5}>
            {label}
          </Text>
          <Text size="sm" fw={650} truncate mt={3} tt="capitalize">
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" truncate>
              {hint}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="lg" align="flex-start">
      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      <Text size="sm" fw={600} ta="right" style={{ minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </Text>
    </Group>
  );
}
