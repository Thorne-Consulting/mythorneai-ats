import { ActionIcon, Avatar, Badge, Box, Breadcrumbs, Divider, Group, Menu, Paper, Select, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconBriefcase2, IconDots, IconMapPin, IconTargetArrow, IconUser } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { api } from '../api';
import { formatDate, formatDateTime, initials, LoadingBlock, StatusBadge } from '../components/Common';
import type { BoardData, RequisitionDetail } from '../types';
import { useCurrentUser } from '../auth';

export function RequisitionDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const details = useQuery({ queryKey: ['requisition', id], queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${id}`) });
  const board = useQuery({ queryKey: ['board', id], queryFn: () => api.get<BoardData>(`/api/requisitions/${id}/board`) });
  const canManage = ['Admin', 'Recruiter'].includes(user.role) || (user.role === 'HiringManager' && details.data?.ownerEmail === user.email);
  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['requisition', id] }); queryClient.invalidateQueries({ queryKey: ['requisitions'] }); notifications.show({ color: 'teal', message: 'Requisition status updated' }); },
  });
  const moveMutation = useMutation({
    mutationFn: ({ applicationId, stageId }: { applicationId: string; stageId: string }) => api.patch<void>(`/api/applications/${applicationId}/stage`, { stageId, status: 'Active', dispositionReason: null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['board', id] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (!details.data || !board.data) return <LoadingBlock />;
  const requisition = details.data;

  return (
    <div>
      <Breadcrumbs mb="md" separator="/">
        <Link to="/requisitions" className="quiet-link">Requisitions</Link>
        <Text size="sm" c="dimmed">{requisition.code}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start" mb="xl">
        <Group align="flex-start">
          <ActionIcon variant="subtle" color="gray" mt={4} onClick={() => navigate({ to: '/requisitions' })}><IconArrowLeft size={20} /></ActionIcon>
          <div>
            <Group gap="sm"><Title order={1} fz={{ base: 26, sm: 32 }}>{requisition.title}</Title><StatusBadge status={requisition.status} /></Group>
            <Text c="dimmed" mt={5}>{requisition.code} · {requisition.department}</Text>
          </div>
        </Group>
        {canManage && <Select value={requisition.status} onChange={(value) => value && statusMutation.mutate(value)} data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']} w={150} allowDeselect={false} />}
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 4 }} mb="xl">
        <InfoCard icon={IconMapPin} label="Location" value={`${requisition.location} · ${requisition.workMode}`} />
        <InfoCard icon={IconTargetArrow} label="Openings" value={`${requisition.openings} ${requisition.employmentType.toLowerCase()}`} />
        <InfoCard icon={IconUser} label="Hiring manager" value={requisition.ownerEmail} />
        <InfoCard icon={IconBriefcase2} label="Target start" value={formatDate(requisition.targetStartDate)} />
      </SimpleGrid>

      <Paper withBorder radius="lg" mb="xl">
        <Group justify="space-between" p="lg"><div><Text fw={700}>Hiring pipeline</Text><Text c="dimmed" size="sm">Move candidates through the approved process.</Text></div><Badge variant="light" color="indigo" tt="none">{board.data.stages.reduce((sum, stage) => sum + stage.applications.length, 0)} active</Badge></Group>
        <Divider />
        <Box className="pipeline-scroll">
          <div className="pipeline-grid">
            {board.data.stages.map((stage) => (
              <section key={stage.id} className="pipeline-column">
                <Group justify="space-between" mb="sm"><Group gap="xs"><Box className="stage-dot" bg={`${stage.color}.5`} /><Text fw={700} size="sm">{stage.name}</Text></Group><Badge color="gray" variant="light" circle>{stage.applications.length}</Badge></Group>
                <Stack gap="sm">
                  {stage.applications.map((application) => (
                    <Paper key={application.id} withBorder radius="md" p="md" className="candidate-card">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <UnstyledButton style={{ flex: 1, minWidth: 0 }} onClick={() => navigate({ to: '/applications/$id', params: { id: application.id } })}>
                          <Group wrap="nowrap" align="flex-start"><Avatar size={34} color={stage.color} variant="light">{initials(application.candidateName)}</Avatar><div style={{ minWidth: 0 }}><Text fw={650} size="sm" truncate>{application.candidateName}</Text><Text size="xs" c="dimmed" truncate>{application.currentTitle ?? application.location ?? 'Candidate'}</Text></div></Group>
                        </UnstyledButton>
                        {canManage && (
                          <Menu position="bottom-end">
                            <Menu.Target><ActionIcon variant="subtle" color="gray" size="sm"><IconDots size={16} /></ActionIcon></Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Label>Move to</Menu.Label>
                              {board.data.stages.filter((target) => target.id !== stage.id).map((target) => <Menu.Item key={target.id} onClick={() => moveMutation.mutate({ applicationId: application.id, stageId: target.id })}>{target.name}</Menu.Item>)}
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Group>
                      <Group justify="space-between" mt="md"><Text size="xs" c="dimmed">{application.source}</Text><Text size="xs" c="dimmed">{formatDateTime(application.lastActivityAt)}</Text></Group>
                    </Paper>
                  ))}
                  {stage.applications.length === 0 && <Paper withBorder radius="md" p="md" className="empty-stage"><Text size="xs" c="dimmed" ta="center">No candidates</Text></Paper>}
                </Stack>
              </section>
            ))}
          </div>
        </Box>
      </Paper>

      <Paper withBorder radius="lg" p="xl">
        <Text fw={700} mb="sm">Role summary</Text>
        <Text c={requisition.description ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>{requisition.description || 'No role summary has been added.'}</Text>
      </Paper>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof IconBriefcase2; label: string; value: string }) {
  return <Paper withBorder radius="lg" p="lg"><Group wrap="nowrap"><ThemeIcon variant="light" color="indigo" size={38}><Icon size={19} /></ThemeIcon><div style={{ minWidth: 0 }}><Text size="xs" c="dimmed" fw={650}>{label}</Text><Text size="sm" fw={650} truncate>{value}</Text></div></Group></Paper>;
}
