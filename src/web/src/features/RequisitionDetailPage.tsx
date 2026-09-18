'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
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
  IconArrowLeft,
  IconBriefcase2,
  IconDots,
  IconMapPin,
  IconPlus,
  IconTargetArrow,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import {
  formatDate,
  formatDateTime,
  initials,
  LoadingBlock,
  StatusBadge,
} from '../components/Common';
import type { BoardData, RequisitionDetail } from '../types';
import { useCurrentUser } from '../auth';

export function RequisitionDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useCurrentUser();
  const [kitOpened, kitModal] = useDisclosure();
  const details = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${id}`),
  });
  const board = useQuery({
    queryKey: ['board', id],
    queryFn: () => api.get<BoardData>(`/api/requisitions/${id}/board`),
  });
  const canManage =
    ['Admin', 'Recruiter'].includes(user.role) ||
    (user.role === 'HiringManager' && details.data?.ownerEmail === user.email);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Hiring session status updated' });
    },
  });
  const moveMutation = useMutation({
    mutationFn: ({ applicationId, stageId }: { applicationId: string; stageId: string }) =>
      api.patch<void>(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (!details.data || !board.data) return <LoadingBlock />;
  const requisition = details.data;

  return (
    <div>
      <Breadcrumbs mb="md" separator="/">
        <Link href="/requisitions" className="quiet-link">
          Hiring sessions
        </Link>
        <Text size="sm" c="dimmed">
          {requisition.code}
        </Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start" mb="xl">
        <Group align="flex-start">
          <ActionIcon
            variant="subtle"
            color="gray"
            mt={4}
            onClick={() => router.push('/requisitions')}
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Group gap="sm">
              <Title order={1} fz={{ base: 26, sm: 32 }}>
                {requisition.title}
              </Title>
              <StatusBadge status={requisition.status} />
            </Group>
            <Text c="dimmed" mt={5}>
              {requisition.code} · {requisition.department}
            </Text>
          </div>
        </Group>
        {canManage && (
          <Select
            value={requisition.status}
            onChange={(value) => value && statusMutation.mutate(value)}
            data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
            w={150}
            allowDeselect={false}
          />
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 4 }} mb="xl">
        <InfoCard
          icon={IconMapPin}
          label="Location"
          value={`${requisition.location} · ${requisition.workMode}`}
        />
        <InfoCard
          icon={IconTargetArrow}
          label="Openings"
          value={`${requisition.openings} ${requisition.employmentType.toLowerCase()}`}
        />
        <InfoCard icon={IconUser} label="Hiring manager" value={requisition.ownerEmail} />
        <InfoCard
          icon={IconBriefcase2}
          label="Target start"
          value={formatDate(requisition.targetStartDate)}
        />
      </SimpleGrid>

      <Paper withBorder radius="lg" mb="xl">
        <Group justify="space-between" p="lg">
          <div>
            <Text fw={700}>Interview kits</Text>
            <Text c="dimmed" size="sm">
              Shared instructions and scoring criteria for this role.
            </Text>
          </div>
          {canManage && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={kitModal.open}
            >
              Add kit
            </Button>
          )}
        </Group>
        <Divider />
        {requisition.interviewKits.length === 0 ? (
          <Text p="lg" c="dimmed" size="sm">
            No structured interview kits yet.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} p="lg">
            {requisition.interviewKits.map((kit) => (
              <Paper key={kit.id} withBorder radius="md" p="md">
                <Group justify="space-between">
                  <Text fw={650}>{kit.name}</Text>
                  <Badge variant="light" color="gray">
                    {kit.durationMinutes} min
                  </Badge>
                </Group>
                {kit.instructions && (
                  <Text size="sm" c="dimmed" mt="xs">
                    {kit.instructions}
                  </Text>
                )}
                <Stack gap={4} mt="md">
                  {kit.criteria.map((criterion) => (
                    <Paper key={criterion.id} bg="gray.0" p="sm" radius="sm">
                      <Group justify="space-between">
                        <Text size="sm" fw={650}>
                          {criterion.name}
                        </Text>
                        <Badge size="xs" variant="light">
                          Weight {criterion.weight}
                        </Badge>
                      </Group>
                      <Text size="sm" mt={3}>
                        {criterion.question}
                      </Text>
                      {criterion.description && (
                        <Text size="xs" c="dimmed">
                          {criterion.description}
                        </Text>
                      )}
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </Paper>

      <Paper withBorder radius="lg" mb="xl">
        <Group justify="space-between" p="lg">
          <div>
            <Text fw={700}>Hiring pipeline</Text>
            <Text c="dimmed" size="sm">
              Review and move applicants through the hiring process.
            </Text>
          </div>
          <Badge variant="light" color="indigo" tt="none">
            {board.data.stages.reduce((sum, stage) => sum + stage.applications.length, 0)} active
          </Badge>
        </Group>
        <Divider />
        <Box className="pipeline-scroll">
          <div className="pipeline-grid">
            {board.data.stages.map((stage) => (
              <section key={stage.id} className="pipeline-column">
                <Group justify="space-between" mb="sm">
                  <Group gap="xs">
                    <Box className="stage-dot" bg={`${stage.color}.5`} />
                    <Text fw={700} size="sm">
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
                      className="candidate-card"
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <UnstyledButton
                          style={{ flex: 1, minWidth: 0 }}
                          onClick={() => router.push(`/applications/${application.id}`)}
                        >
                          <Group wrap="nowrap" align="flex-start">
                            <Avatar size={34} color={stage.color} variant="light">
                              {initials(application.candidateName)}
                            </Avatar>
                            <div style={{ minWidth: 0 }}>
                              <Text fw={650} size="sm" truncate>
                                {application.candidateName}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                {application.currentTitle ?? application.location ?? 'Candidate'}
                              </Text>
                            </div>
                          </Group>
                        </UnstyledButton>
                        {canManage && (
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" size="sm">
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
                      <Group justify="space-between" mt="md">
                        <Text size="xs" c="dimmed">
                          {application.source}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDateTime(application.lastActivityAt)}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
                  {stage.applications.length === 0 && (
                    <Paper withBorder radius="md" p="md" className="empty-stage">
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

      <Paper withBorder radius="lg" p="xl">
        <Text fw={700} mb="sm">
          Role summary
        </Text>
        <Text c={requisition.description ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
          {requisition.description || 'No role summary has been added.'}
        </Text>
      </Paper>
      <InterviewKitModal requisitionId={id} opened={kitOpened} onClose={kitModal.close} />
    </div>
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
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Add interview kit</Title>}
      size="lg"
      centered
    >
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
}: {
  icon: typeof IconBriefcase2;
  label: string;
  value: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg">
      <Group wrap="nowrap">
        <ThemeIcon variant="light" color="indigo" size={38}>
          <Icon size={19} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={650}>
            {label}
          </Text>
          <Text size="sm" fw={650} truncate>
            {value}
          </Text>
        </div>
      </Group>
    </Paper>
  );
}
