'use client';

import {
  Avatar,
  Badge,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowRight, IconBriefcase2, IconCalendarEvent, IconUsers } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../api';
import { formatDateTime, initials, LoadingBlock, PageHeader } from '../components/Common';
import type { DashboardData } from '../types';
import { useCurrentUser } from '../auth';

export function DashboardPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });
  const firstName = user.displayName.split(' ')[0];

  if (!query.data)
    return (
      <>
        <PageHeader
          title={`Good morning, ${firstName}`}
          description="Here is what needs attention across hiring."
        />
        <LoadingBlock />
      </>
    );
  const data = query.data;
  const metrics = [
    {
      label: 'Open hiring sessions',
      value: data.openRequisitions,
      icon: IconBriefcase2,
      color: 'indigo',
      to: '/requisitions' as const,
    },
    {
      label: 'Active applicants',
      value: data.activeCandidates,
      icon: IconUsers,
      color: 'teal',
      to: '/applicants' as const,
    },
    {
      label: 'Interviews this week',
      value: data.interviewsThisWeek,
      icon: IconCalendarEvent,
      color: 'violet',
      to: '/requisitions' as const,
    },
  ];

  return (
    <Box maw={1440} mx="auto">
      <PageHeader
        title={`Good morning, ${firstName}`}
        description="Here is what needs attention across hiring."
      />

      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md" mb="xl">
        {metrics.map((metric) => (
          <Paper
            key={metric.label}
            withBorder
            radius="lg"
            p="lg"
            className="metric-card"
            onClick={() => router.push(metric.to)}
          >
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.7}>
                  {metric.label}
                </Text>
                <Title order={2} mt={8}>
                  {metric.value}
                </Title>
              </div>
              <ThemeIcon variant="light" color={metric.color} radius="md" size={40}>
                <metric.icon size={20} stroke={1.8} />
              </ThemeIcon>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl">
        <Paper withBorder radius="lg" className="panel" style={{ gridColumn: 'span 2' }}>
          <Group justify="space-between" p="lg" className="panel-header">
            <div>
              <Text fw={700}>Recently active</Text>
              <Text size="sm" c="dimmed">
                Candidates with recent movement
              </Text>
            </div>
          </Group>
          <Stack gap={0}>
            {data.recentApplications.map((item) => (
              <UnstyledButton
                key={item.id}
                className="list-row"
                onClick={() => router.push(`/applications/${item.id}`)}
              >
                <Group wrap="nowrap">
                  <Avatar radius="xl" color="indigo" variant="light">
                    {initials(item.candidateName)}
                  </Avatar>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs">
                      <Text fw={650} size="sm">
                        {item.candidateName}
                      </Text>
                      <Badge size="xs" variant="light" color="gray" tt="none">
                        {item.stage}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                      {item.candidateTitle ?? 'Candidate'} · {item.requisitionTitle}
                    </Text>
                  </Box>
                  <Text size="xs" c="dimmed" visibleFrom="sm">
                    {formatDateTime(item.lastActivityAt)}
                  </Text>
                  <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
                </Group>
              </UnstyledButton>
            ))}
            {data.recentApplications.length === 0 && (
              <Text c="dimmed" p="xl">
                No active applications yet.
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" className="panel">
          <Box p="lg" className="panel-header">
            <Text fw={700}>Upcoming interviews</Text>
            <Text size="sm" c="dimmed">
              Next seven days
            </Text>
          </Box>
          <Stack gap={0}>
            {data.upcomingInterviews.map((interview) => (
              <UnstyledButton
                key={interview.id}
                className="interview-row"
                onClick={() => router.push(`/applications/${interview.applicationId}`)}
              >
                <Group align="flex-start" wrap="nowrap">
                  <Box className="date-chip">
                    <Text size="xs" tt="uppercase">
                      {new Date(interview.startsAt).toLocaleDateString(undefined, {
                        month: 'short',
                      })}
                    </Text>
                    <Text fw={800}>{new Date(interview.startsAt).getDate()}</Text>
                  </Box>
                  <div>
                    <Text fw={650} size="sm">
                      {interview.candidateName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {interview.title}
                    </Text>
                    <Text size="xs" c="indigo" mt={3}>
                      {formatDateTime(interview.startsAt)}
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
            ))}
            {data.upcomingInterviews.length === 0 && (
              <Text c="dimmed" p="xl" size="sm">
                No interviews scheduled.
              </Text>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>
    </Box>
  );
}
