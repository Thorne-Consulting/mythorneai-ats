'use client';

import {
  Avatar,
  Badge,
  Box,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconCalendar, IconClock } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { initials } from '@/lib/format';
import type { DashboardData } from '@/types';

type Interview = DashboardData['upcomingInterviews'][number];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function timeRange(start: string, end: string) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function buildWeekDays() {
  const days: Date[] = [];
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function isToday(d: Date) {
  return d.toDateString() === new Date().toDateString();
}

function InterviewCard({ interview, onClick }: { interview: Interview; onClick: () => void }) {
  return (
    <UnstyledButton className="hover-card" onClick={onClick} w="100%" p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-default-border)' }}>
      <Group wrap="nowrap" gap="sm">
        <Avatar size={36} color="indigo" radius="xl" variant="light">
          {initials(interview.candidateName)}
        </Avatar>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {interview.candidateName}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {interview.title}
          </Text>
        </Box>
      </Group>
      <Group gap="xs" mt="xs">
        <IconClock size={13} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed" className="tnum">
          {timeRange(interview.startsAt, interview.endsAt)}
        </Text>
      </Group>
      <Text size="xs" c="indigo.6" mt={4} truncate>
        {interview.requisitionTitle}
      </Text>
    </UnstyledButton>
  );
}

export function InterviewsPage({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
    initialData,
  });

  if (!query.data) return <LoadingBlock rows={6} />;

  const interviews = query.data.upcomingInterviews;
  const weekDays = buildWeekDays();

  const byDay = new Map<string, Interview[]>();
  for (const iv of interviews) {
    const key = new Date(iv.startsAt).toDateString();
    const arr = byDay.get(key) ?? [];
    arr.push(iv);
    byDay.set(key, arr);
  }

  return (
    <>
      <PageHeader
        title="Interviews"
        description={`${interviews.length} upcoming this week`}
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 7 }} spacing="md">
        {weekDays.map((day) => {
          const key = day.toDateString();
          const dayInterviews = byDay.get(key) ?? [];
          const today = isToday(day);
          return (
            <Stack
              key={key}
              gap="sm"
              p="md"
              style={{
                borderRadius: 'var(--mantine-radius-lg)',
                background: today ? 'var(--mantine-color-indigo-light)' : 'var(--surface-sunken)',
                minHeight: 160,
              }}
            >
              <Group gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c={today ? 'indigo.7' : 'dimmed'}>
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text size="lg" fw={700} className="tnum" c={today ? 'indigo.7' : undefined}>
                  {day.getDate()}
                </Text>
                {today && (
                  <Badge size="xs" variant="filled" color="indigo" ml="auto">
                    Today
                  </Badge>
                )}
              </Group>

              {dayInterviews.length > 0 ? (
                dayInterviews
                  .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
                  .map((iv) => (
                    <InterviewCard
                      key={iv.id}
                      interview={iv}
                      onClick={() => router.push(`/applications/${iv.applicationId}`)}
                    />
                  ))
              ) : (
                <Text size="xs" c="dimmed" mt="auto" ta="center">
                  No interviews
                </Text>
              )}
            </Stack>
          );
        })}
      </SimpleGrid>
    </>
  );
}
