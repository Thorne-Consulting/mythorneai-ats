'use client';

import {
  Avatar,
  Badge,
  Box,
  Card,
  Grid,
  Group,
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
import { api } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDateTime, initials } from '@/lib/format';
import type { DashboardData } from '@/types';
import { useCurrentUser } from '@/auth';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage({ initialData }: { initialData: DashboardData }) {
  const user = useCurrentUser();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
    initialData,
  });
  const firstName = user.displayName.split(' ')[0];
  const header = (
    <PageHeader
      title={`${greeting()}, ${firstName}`}
      description="Here is what needs attention across hiring."
    />
  );

  if (!query.data)
    return (
      <>
        {header}
        <Grid gutter="md">
          {[0, 1, 2].map((index) => (
            <Grid.Col key={index} span={{ base: 12, sm: 4 }}>
              <LoadingBlock rows={1} />
            </Grid.Col>
          ))}
        </Grid>
      </>
    );

  const data = query.data;
  const metrics = [
    {
      label: 'Open jobs',
      value: data.openRequisitions,
      icon: IconBriefcase2,
      color: 'indigo',
      to: '/requisitions',
    },
    {
      label: 'Active applicants',
      value: data.activeCandidates,
      icon: IconUsers,
      color: 'teal',
      to: '/applicants',
    },
    {
      label: 'Interviews this week',
      value: data.interviewsThisWeek,
      icon: IconCalendarEvent,
      color: 'violet',
      to: '/requisitions',
    },
  ];

  return (
    <>
      {header}

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="xl">
        {metrics.map((metric) => (
          <Card
            key={metric.label}
            component="button"
            type="button"
            ta="left"
            h="100%"
            p={{ base: 'md', sm: 'lg' }}
            className="hover-card"
            style={{ cursor: 'pointer' }}
            onClick={() => router.push(metric.to)}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap" h="100%">
              <Box
                style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}
              >
                {/* label grows so the values stay on one baseline when labels wrap */}
                <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.6} style={{ flex: 1 }}>
                  {metric.label}
                </Text>
                <Title order={2} fz={{ base: 28, sm: 32 }} mt={6} className="tnum" lh={1.1}>
                  {metric.value}
                </Title>
              </Box>
              <ThemeIcon variant="light" color={metric.color} radius="md" size={40}>
                <metric.icon size={20} stroke={1.8} />
              </ThemeIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <Grid gutter={{ base: 'md', lg: 'xl' }} align="stretch">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SectionCard title="Recently active" description="Candidates with recent movement">
            <Stack gap={0}>
              {data.recentApplications.map((item) => (
                <UnstyledButton
                  key={item.id}
                  className="list-row"
                  data-interactive
                  onClick={() => router.push(`/applications/${item.id}`)}
                >
                  <Group wrap="nowrap">
                    <Avatar radius="xl" color="indigo" variant="light">
                      {initials(item.candidateName)}
                    </Avatar>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text fw={650} size="sm" truncate>
                          {item.candidateName}
                        </Text>
                        <Badge size="xs" variant="light" color="gray">
                          {item.stage}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" truncate>
                        {item.candidateTitle ?? 'Candidate'} · {item.requisitionTitle}
                      </Text>
                    </Box>
                    <Text
                      size="xs"
                      c="dimmed"
                      className="tnum"
                      visibleFrom="sm"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {formatDateTime(item.lastActivityAt)}
                    </Text>
                    <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
                  </Group>
                </UnstyledButton>
              ))}
              {data.recentApplications.length === 0 && (
                <Text c="dimmed" p="xl" size="sm">
                  No active applications yet.
                </Text>
              )}
            </Stack>
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <SectionCard title="Upcoming interviews" description="Next seven days">
            <Stack gap={0}>
              {data.upcomingInterviews.map((interview) => (
                <UnstyledButton
                  key={interview.id}
                  className="list-row"
                  data-interactive
                  onClick={() => router.push(`/applications/${interview.applicationId}`)}
                >
                  <Group align="flex-start" wrap="nowrap">
                    <Box className="date-chip">
                      <Text size="xs" tt="uppercase">
                        {new Date(interview.startsAt).toLocaleDateString(undefined, {
                          month: 'short',
                        })}
                      </Text>
                      <Text fw={750} className="tnum" lh={1.15}>
                        {new Date(interview.startsAt).getDate()}
                      </Text>
                    </Box>
                    <Box style={{ minWidth: 0 }}>
                      <Text fw={650} size="sm" truncate>
                        {interview.candidateName}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {interview.title}
                      </Text>
                      <Text size="xs" c="indigo" mt={3}>
                        {formatDateTime(interview.startsAt)}
                      </Text>
                    </Box>
                  </Group>
                </UnstyledButton>
              ))}
              {data.upcomingInterviews.length === 0 && (
                <Text c="dimmed" p="xl" size="sm">
                  No interviews scheduled.
                </Text>
              )}
            </Stack>
          </SectionCard>
        </Grid.Col>
      </Grid>
    </>
  );
}
