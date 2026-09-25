'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendarPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { ScheduleInterviewDrawer } from './ScheduleInterviewDrawer';

type CalendarInterview = {
  id: string;
  applicationId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  candidateName: string;
  requisitionTitle: string;
  interviewerEmails: string[];
};
const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dateRange = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const timeName = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 20;
const HOUR_HEIGHT = 72;

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function sameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}
function weekLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  if (
    weekStart.getMonth() === weekEnd.getMonth() &&
    weekStart.getFullYear() === weekEnd.getFullYear()
  ) {
    const month = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(weekStart);
    return `${month} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${dateRange.format(weekStart)} – ${dateRange.format(weekEnd)}`;
}
function timePosition(value: string) {
  const date = new Date(value);
  return (date.getHours() + date.getMinutes() / 60 - CALENDAR_START_HOUR) * HOUR_HEIGHT;
}
function eventHeight(interview: CalendarInterview) {
  const duration = new Date(interview.endsAt).getTime() - new Date(interview.startsAt).getTime();
  return Math.max((duration / 3_600_000) * HOUR_HEIGHT, 34);
}

export function InterviewsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const canSchedule = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [scheduleAt, setScheduleAt] = useState<Date>(() => new Date());
  const [opened, drawer] = useDisclosure();
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const query = useQuery({
    queryKey: ['interview-calendar', weekStart.toISOString()],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(weekEnd.toISOString())}`,
      ),
  });
  const interviewsByDay = useMemo(() => {
    const result = new Map<string, CalendarInterview[]>();
    for (const interview of query.data ?? []) {
      const key = dateKey(new Date(interview.startsAt));
      result.set(key, [...(result.get(key) ?? []), interview]);
    }
    return result;
  }, [query.data]);
  const openSchedule = (date = selectedDate) => {
    setScheduleAt(date);
    drawer.open();
  };

  return (
    <>
      <PageHeader
        title="Interviews"
        actions={
          canSchedule ? (
            <Button leftSection={<IconCalendarPlus size={16} />} onClick={() => openSchedule()}>
              Schedule interview
            </Button>
          ) : undefined
        }
      />
      <SimpleGrid cols={{ base: 1, xl: 5 }} spacing="lg" className="interviews-workspace">
        <Paper withBorder radius="lg" p="md">
          <Stack gap="md">
            {canSchedule && (
              <Button
                leftSection={<IconCalendarPlus size={16} />}
                fullWidth
                onClick={() => openSchedule()}
              >
                Schedule interview
              </Button>
            )}
            <DatePicker
              value={selectedDate.toISOString().slice(0, 10)}
              onChange={(value) => value && setSelectedDate(new Date(`${value}T12:00:00`))}
            />
            <Button variant="default" fullWidth onClick={() => setSelectedDate(new Date())}>
              Today
            </Button>
            <Text size="sm" c="dimmed">
              Select a day to view its week or open a new interview slot.
            </Text>
          </Stack>
        </Paper>
        <Paper
          withBorder
          radius="lg"
          p="md"
          className="interviews-calendar-panel"
          style={{ gridColumn: 'span 4', minWidth: 0 }}
        >
          <Group justify="space-between" mb="md" wrap="wrap">
            <Group gap="xs">
              <Button variant="default" size="sm" onClick={() => setSelectedDate(new Date())}>
                Today
              </Button>
              <Tooltip label="Previous week">
                <ActionIcon
                  variant="default"
                  aria-label="Previous week"
                  onClick={() => setSelectedDate(addDays(selectedDate, -7))}
                >
                  <IconChevronLeft size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Next week">
                <ActionIcon
                  variant="default"
                  aria-label="Next week"
                  onClick={() => setSelectedDate(addDays(selectedDate, 7))}
                >
                  <IconChevronRight size={16} />
                </ActionIcon>
              </Tooltip>
              <Text fw={650} size="lg">
                {weekLabel(weekStart)}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {query.data?.length ?? 0} scheduled this week
            </Text>
          </Group>
          {query.isLoading ? (
            <LoadingBlock rows={5} />
          ) : (
            <Box className="interviews-calendar-grid" style={{ overflow: 'auto' }}>
              <Box
                style={{
                  minWidth: 1080,
                  display: 'grid',
                  gridTemplateColumns: '72px repeat(7, minmax(144px, 1fr))',
                  borderTop: '1px solid var(--mantine-color-default-border)',
                  borderLeft: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Box
                  style={{
                    borderRight: '1px solid var(--mantine-color-default-border)',
                    minHeight: 62,
                  }}
                />
                {weekDays.map((day) => {
                  const today = sameDay(day, new Date());
                  return (
                    <Stack
                      key={dateKey(day)}
                      gap={2}
                      align="center"
                      justify="center"
                      style={{
                        borderRight: '1px solid var(--mantine-color-default-border)',
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                        minHeight: 62,
                      }}
                    >
                      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                        {dayName.format(day)}
                      </Text>
                      {today ? (
                        <ThemeIcon size={38} radius="xl" color="indigo" variant="filled">
                          {day.getDate()}
                        </ThemeIcon>
                      ) : (
                        <Text fw={650} size="xl" className="tnum">
                          {day.getDate()}
                        </Text>
                      )}
                    </Stack>
                  );
                })}
                <Box style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
                  {Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, index) => (
                    <Box
                      key={index}
                      h={HOUR_HEIGHT}
                      pr="xs"
                      style={{
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                        textAlign: 'right',
                      }}
                    >
                      <Text size="xs" c="dimmed" className="tnum">
                        {timeName.format(new Date(2026, 0, 1, CALENDAR_START_HOUR + index))}
                      </Text>
                    </Box>
                  ))}
                </Box>
                {weekDays.map((day) => {
                  const interviews = (interviewsByDay.get(dateKey(day)) ?? []).filter(
                    (item) =>
                      timePosition(item.startsAt) >= 0 &&
                      timePosition(item.startsAt) <
                        (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT,
                  );
                  const today = sameDay(day, new Date());
                  return (
                    <Box
                      key={dateKey(day)}
                      pos="relative"
                      role={canSchedule ? 'button' : undefined}
                      tabIndex={canSchedule ? 0 : undefined}
                      aria-label={
                        canSchedule
                          ? `Schedule an interview on ${day.toLocaleDateString()}`
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (canSchedule && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          openSchedule(day);
                        }
                      }}
                      onClick={(event) => {
                        if (!canSchedule) return;
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const minutes = Math.max(
                          0,
                          Math.min(
                            (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60 - 30,
                            Math.round(((event.clientY - bounds.top) / HOUR_HEIGHT) * 2) * 30,
                          ),
                        );
                        const date = new Date(day);
                        date.setHours(
                          CALENDAR_START_HOUR + Math.floor(minutes / 60),
                          minutes % 60,
                          0,
                          0,
                        );
                        openSchedule(date);
                      }}
                      style={{
                        height: (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT,
                        borderRight: '1px solid var(--mantine-color-default-border)',
                        backgroundColor: today ? 'var(--mantine-color-indigo-light)' : undefined,
                        backgroundImage:
                          'repeating-linear-gradient(to bottom, transparent 0, transparent 71px, var(--mantine-color-default-border) 72px)',
                      }}
                    >
                      {interviews.map((interview) => (
                        <Button
                          key={interview.id}
                          variant="filled"
                          color="indigo"
                          pos="absolute"
                          left={4}
                          right={4}
                          top={timePosition(interview.startsAt)}
                          h={eventHeight(interview)}
                          px={8}
                          py={4}
                          justify="flex-start"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/applications/${interview.applicationId}`);
                          }}
                          styles={{
                            root: { overflow: 'hidden', borderRadius: 'var(--mantine-radius-sm)' },
                            label: {
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              whiteSpace: 'normal',
                              lineHeight: 1.2,
                            },
                          }}
                        >
                          <Text size="xs" fw={700}>
                            {timeName.format(new Date(interview.startsAt))}
                          </Text>
                          <Text size="sm" fw={600} lineClamp={1}>
                            {interview.candidateName}
                          </Text>
                          <Text size="xs" lineClamp={1} style={{ opacity: 0.88 }}>
                            {interview.title}
                          </Text>
                        </Button>
                      ))}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          {!query.isLoading && query.data?.length === 0 && (
            <EmptyState
              icon={IconCalendarPlus}
              title="No interviews this week"
              description="Schedule an interview to add it to this calendar."
              actionLabel={canSchedule ? 'Schedule interview' : undefined}
              onAction={canSchedule ? () => openSchedule() : undefined}
            />
          )}
        </Paper>
      </SimpleGrid>
      {canSchedule && (
        <ScheduleInterviewDrawer opened={opened} onClose={drawer.close} selectedDate={scheduleAt} />
      )}
    </>
  );
}
