'use client';

import {
  Avatar,
  Badge,
  Box,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import { IconArrowRight } from '@tabler/icons-react';
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

const STAGE_COLOR: Record<string, string> = {
  New: 'gray.5',
  Review: 'indigo.5',
  Interview: 'teal.5',
  'Offer handoff': 'violet.5',
  Hired: 'green.5',
  Rejected: 'red.4',
};

function stageColor(stage: string) {
  return STAGE_COLOR[stage] ?? 'gray.5';
}

function stageBadgeColor(stage: string): string {
  const c = STAGE_COLOR[stage];
  if (!c) return 'gray';
  return c.split('.')[0];
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

  if (!query.data)
    return (
      <>
        <PageHeader title={`${greeting()}, ${firstName}`} description="Your hiring pipeline at a glance" />
        <Grid gutter="md">
          {[0, 1, 2].map((i) => (
            <Grid.Col key={i} span={{ base: 12, sm: 4 }}>
              <LoadingBlock rows={2} />
            </Grid.Col>
          ))}
        </Grid>
      </>
    );

  const data = query.data;

  const stageCounts = data.recentApplications.reduce<Record<string, number>>((acc, item) => {
    acc[item.stage] = (acc[item.stage] || 0) + 1;
    return acc;
  }, {});
  const donutData = Object.entries(stageCounts).map(([name, value]) => ({
    name,
    value,
    color: stageColor(name),
  }));

  const today = new Date();
  const scheduleData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return {
      day: d.toLocaleDateString(undefined, { weekday: 'short' }),
      Interviews: data.upcomingInterviews.filter(
        (iv) => new Date(iv.startsAt).toDateString() === d.toDateString(),
      ).length,
    };
  });

  const stats = [
    { value: data.openRequisitions, label: 'Open jobs', color: 'indigo', to: '/requisitions' },
    { value: data.activeCandidates, label: 'Active applicants', color: 'teal', to: '/applicants' },
    { value: data.interviewsThisWeek, label: 'Interviews this week', color: 'violet', to: '/interviews' },
  ];

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Your hiring pipeline at a glance" />

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="xl">
        {stats.map((stat) => (
          <UnstyledButton
            key={stat.label}
            className="hover-card"
            onClick={() => router.push(stat.to)}
            style={{
              padding: 'var(--mantine-spacing-lg)',
              borderRadius: 'var(--mantine-radius-lg)',
              background: `var(--mantine-color-${stat.color}-light)`,
            }}
          >
            <Text size="sm" fw={500} c={`${stat.color}.7`}>
              {stat.label}
            </Text>
            <Text fz={36} fw={700} lh={1.1} mt={6} className="tnum" c={`${stat.color}.7`}>
              {stat.value}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <Grid gutter={{ base: 'md', lg: 'xl' }} mb="xl">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <SectionCard title="Pipeline" description="Candidates by stage">
            {donutData.length > 0 ? (
              <Stack align="center" gap="md" py="md">
                <DonutChart
                  data={donutData}
                  size={200}
                  thickness={32}
                  withTooltip
                  tooltipDataSource="segment"
                  chartLabel={`${data.recentApplications.length}`}
                  h={200}
                  styles={{ label: { fontSize: 28, fontWeight: 700 } }}
                />
                <Group justify="center" gap="sm">
                  {donutData.map((d, i) => (
                    <Text key={d.name} size="md" c={d.color}>
                      {i > 0 && <Text span c="dimmed" size="sm" mx={2}>·</Text>}
                      <Text span fw={600} className="tnum">{d.value}</Text>{' '}
                      {d.name.toLowerCase()}
                    </Text>
                  ))}
                </Group>
              </Stack>
            ) : (
              <Text c="dimmed" size="sm" p="xl">
                No pipeline data yet.
              </Text>
            )}
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <SectionCard title="Interview schedule" description="Next 7 days">
            <BarChart
              h={220}
              data={scheduleData}
              dataKey="day"
              series={[{ name: 'Interviews', color: 'indigo.6' }]}
              tickLine="none"
              gridAxis="none"
              withLegend={false}
              withYAxis={false}
              barProps={{ radius: [4, 4, 0, 0] }}
              xAxisProps={{ fontSize: 14 }}
            />
          </SectionCard>
        </Grid.Col>
      </Grid>

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
                        <Badge size="xs" variant="light" color={stageBadgeColor(item.stage)}>
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
                      <Text size="xs">
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
