'use client';

import {
  Avatar,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDateTime, initials } from '@/lib/format';
import type { DashboardData } from '@/types';
import { useCurrentUser } from '@/auth';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import { InterviewerHome, ScorecardsDueCard } from './InterviewerHome';

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

// Custom pipelines add stages the fixed map doesn't know; give those a distinct colour each.
const FALLBACK_COLORS = [
  'gray.5',
  'indigo.5',
  'teal.5',
  'violet.5',
  'orange.5',
  'cyan.5',
  'grape.5',
  'pink.5',
];

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
  const approvals = usePendingApprovals();
  const waiting = approvals.data?.length ?? 0;
  const checklist = useQuery({
    queryKey: ['admin', 'setup-checklist'],
    queryFn: () =>
      api.get<Array<{ key: string; title: string; detail: string; done: boolean; href: string }>>(
        '/api/admin/setup-checklist',
      ),
    enabled: user.role === 'Admin',
    retry: false,
  });
  const steps = checklist.data ?? [];
  const stepsDone = steps.filter((step) => step.done).length;
  const firstName = user.displayName.split(' ')[0];

  if (!query.data)
    return (
      <>
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          description="Your hiring pipeline at a glance"
        />
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

  if (user.role === 'Interviewer')
    return <InterviewerHome data={data} firstName={firstName} greeting={greeting()} />;

  // Every active application by stage, so the chart agrees with the "active applicants" tile.
  const donutData = data.pipeline.map((item, index) => ({
    name: item.stage,
    value: item.count,
    color: STAGE_COLOR[item.stage] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  }));
  const activeTotal = data.pipeline.reduce((sum, item) => sum + item.count, 0);

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
    {
      value: data.interviewsThisWeek,
      label: 'Interviews this week',
      color: 'violet',
      to: '/interviews',
    },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description="Your hiring pipeline at a glance"
      />

      {waiting > 0 && (
        <Paper withBorder radius="lg" p="lg" mb="xl">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Box>
              <Text fw={650}>Waiting on you</Text>
              <Text size="sm" c="dimmed">
                {waiting === 1
                  ? '1 thing needs your approval before it can go ahead.'
                  : `${waiting} things need your approval before they can go ahead.`}
              </Text>
            </Box>
            <Button component={Link} href="/approvals" rightSection={<IconArrowRight size={16} />}>
              Review {waiting === 1 ? 'it' : 'them'}
            </Button>
          </Group>
        </Paper>
      )}

      {steps.length > 0 && stepsDone < steps.length && (
        <Box mb="xl">
          <SectionCard title="Get set up" description={`${stepsDone} of ${steps.length} done`}>
            <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
              {steps.map((step) => (
                <Box component="li" key={step.key}>
                  <UnstyledButton
                    component={Link}
                    href={step.href}
                    className="list-row"
                    data-interactive
                    style={{ display: 'block', width: '100%' }}
                  >
                    <Group wrap="nowrap" gap="sm">
                      {step.done ? (
                        <IconCheck
                          size={16}
                          color="var(--mantine-color-teal-6)"
                          aria-label="Done"
                        />
                      ) : (
                        <Box
                          w={16}
                          h={16}
                          aria-label="Not done"
                          style={{
                            flex: 'none',
                            borderRadius: 999,
                            border: '1.5px solid var(--mantine-color-gray-5)',
                          }}
                        />
                      )}
                      <Box style={{ minWidth: 0 }}>
                        <Text
                          size="sm"
                          fw={600}
                          td={step.done ? 'line-through' : undefined}
                          c={step.done ? 'dimmed' : undefined}
                        >
                          {step.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {step.detail}
                        </Text>
                      </Box>
                    </Group>
                  </UnstyledButton>
                </Box>
              ))}
            </Stack>
          </SectionCard>
        </Box>
      )}

      {data.scorecardsDue.length > 0 && (
        <Box mb="xl">
          <ScorecardsDueCard items={data.scorecardsDue} />
        </Box>
      )}

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
            <Text size="sm" fw={500} c={`var(--mantine-color-${stat.color}-light-color)`}>
              {stat.label}
            </Text>
            <Text
              fz={36}
              fw={700}
              lh={1.1}
              mt={6}
              className="tnum"
              c={`var(--mantine-color-${stat.color}-light-color)`}
            >
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
                  chartLabel={`${activeTotal}`}
                  h={200}
                  styles={{ label: { fontSize: 28, fontWeight: 700 } }}
                />
                <Group justify="center" gap="sm">
                  {donutData.map((d) => (
                    <Group key={d.name} gap={6} wrap="nowrap">
                      <Box
                        w={10}
                        h={10}
                        aria-hidden
                        style={{
                          borderRadius: 999,
                          background: `var(--mantine-color-${d.color.replace('.', '-')})`,
                        }}
                      />
                      <Text size="md">
                        <Text span fw={600} className="tnum">
                          {d.value}
                        </Text>{' '}
                        {d.name.toLowerCase()}
                      </Text>
                    </Group>
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
