'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Popover,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendar,
  IconCalendarPlus,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
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
// The working day is always shown; the grid stretches to fit anything booked outside it.
const DAY_START = 8;
const DAY_END = 19;
const HOUR_HEIGHT = 64;

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
function hoursOf(date: Date) {
  return date.getHours() + date.getMinutes() / 60;
}

/** Visible hour range for a week: the working day, widened to fit every interview. */
function hourRange(interviews: CalendarInterview[]) {
  let start = DAY_START;
  let end = DAY_END;
  for (const interview of interviews) {
    const from = new Date(interview.startsAt);
    const to = new Date(interview.endsAt);
    start = Math.min(start, Math.floor(hoursOf(from)));
    end = Math.max(end, sameDay(from, to) ? Math.ceil(hoursOf(to)) : 24);
  }
  return { start, end: Math.min(end, 24) };
}

type CalendarConnection = { connected: boolean; provider?: string; accountEmail?: string };

export function InterviewsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const canSchedule = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [scheduleAt, setScheduleAt] = useState<Date>(() => new Date());
  const [opened, drawer] = useDisclosure();
  const [pickerOpened, picker] = useDisclosure();
  const scrollRef = useRef<HTMLDivElement>(null);

  const connection = useQuery({
    queryKey: ['calendar-connection'],
    queryFn: () => api.get<CalendarConnection>('/api/calendar/connection'),
  }).data;
  const disconnect = useMutation({
    mutationFn: () => api.delete('/api/calendar/connection'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-connection'] }),
  });
  const connect = async (provider: 'Google' | 'Microsoft') => {
    const result = await api.get<{ authorizationUrl: string }>(`/api/calendar/connect/${provider}`);
    window.location.assign(result.authorizationUrl);
  };

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const query = useQuery({
    queryKey: ['interview-calendar', weekStart.toISOString()],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(addDays(weekStart, 7).toISOString())}`,
      ),
  });
  const interviews = useMemo(() => query.data ?? [], [query.data]);
  const range = useMemo(() => hourRange(interviews), [interviews]);
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarInterview[]>();
    for (const interview of interviews) {
      const key = dateKey(new Date(interview.startsAt));
      result.set(key, [...(result.get(key) ?? []), interview]);
    }
    return result;
  }, [interviews]);

  // Land on the working day, or on the first interview if it starts later.
  useEffect(() => {
    if (!scrollRef.current || query.isLoading) return;
    const first = interviews.length
      ? Math.min(...interviews.map((item) => hoursOf(new Date(item.startsAt))))
      : DAY_START;
    const target = Math.max(range.start, Math.min(DAY_START, first) - 0.5);
    scrollRef.current.scrollTop = (target - range.start) * HOUR_HEIGHT;
  }, [weekStart, interviews, range.start, query.isLoading]);

  const openSchedule = (date = selectedDate) => {
    setScheduleAt(date);
    drawer.open();
  };
  const top = (value: string) => (hoursOf(new Date(value)) - range.start) * HOUR_HEIGHT;
  const height = (item: CalendarInterview) => {
    const from = new Date(item.startsAt);
    const to = new Date(item.endsAt);
    const endHour = sameDay(from, to) ? hoursOf(to) : 24;
    return Math.max((endHour - hoursOf(from)) * HOUR_HEIGHT - 2, 26);
  };
  const now = new Date();
  const count = interviews.length;

  return (
    <>
      <PageHeader
        title="Interviews"
        actions={
          <>
            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <Button
                  variant="default"
                  leftSection={<IconCalendar size={16} />}
                  rightSection={<IconChevronDown size={14} />}
                >
                  {connection?.connected ? `${connection.provider} calendar` : 'Connect calendar'}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  {connection?.connected
                    ? `Connected as ${connection.accountEmail ?? connection.provider}`
                    : 'Booking checks your real availability'}
                </Menu.Label>
                <Menu.Item onClick={() => connect('Google')}>
                  {connection?.provider === 'Google' ? 'Reconnect Google' : 'Connect Google'}
                </Menu.Item>
                <Menu.Item onClick={() => connect('Microsoft')}>
                  {connection?.provider === 'Microsoft'
                    ? 'Reconnect Microsoft'
                    : 'Connect Microsoft'}
                </Menu.Item>
                {connection?.connected && (
                  <>
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={() => disconnect.mutate()}>
                      Disconnect
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
            {canSchedule && (
              <Button leftSection={<IconCalendarPlus size={16} />} onClick={() => openSchedule()}>
                Schedule interview
              </Button>
            )}
          </>
        }
      />

      <div className="cal-toolbar">
        <Group gap={8} wrap="nowrap">
          <Button variant="default" size="sm" onClick={() => setSelectedDate(new Date())}>
            Today
          </Button>
          <Tooltip label="Previous week">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Previous week"
              onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Next week">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="Next week"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Tooltip>
          <Popover opened={pickerOpened} onChange={picker.toggle} position="bottom-start">
            <Popover.Target>
              <UnstyledButton className="cal-week-label" onClick={picker.toggle}>
                {weekLabel(weekStart)}
                <IconChevronDown size={15} aria-hidden />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown>
              <DatePicker
                firstDayOfWeek={1}
                weekendDays={[]}
                previousLabel="Previous month"
                nextLabel="Next month"
                value={selectedDate.toISOString().slice(0, 10)}
                onChange={(value) => {
                  if (value) setSelectedDate(new Date(`${value}T12:00:00`));
                  picker.close();
                }}
              />
            </Popover.Dropdown>
          </Popover>
        </Group>
        <Text size="sm" c="dimmed" className="tnum">
          {query.isLoading
            ? ''
            : count === 0
              ? 'Nothing scheduled this week'
              : `${count} ${count === 1 ? 'interview' : 'interviews'} this week`}
        </Text>
      </div>

      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="panel cal">
          <div className="cal-scroll" ref={scrollRef}>
            <div className="cal-grid">
              <div className="cal-head cal-corner" />
              {weekDays.map((day) => {
                const today = sameDay(day, now);
                return (
                  <div
                    key={dateKey(day)}
                    className="cal-head"
                    data-today={today || undefined}
                    aria-current={today ? 'date' : undefined}
                  >
                    <span className="cal-head-day">{dayName.format(day)}</span>
                    <span className="cal-head-date tnum">{day.getDate()}</span>
                  </div>
                );
              })}

              <div
                className="cal-times"
                style={{ height: (range.end - range.start) * HOUR_HEIGHT }}
              >
                {Array.from({ length: range.end - range.start }, (_, index) => (
                  <span key={index} className="cal-time tnum" style={{ top: index * HOUR_HEIGHT }}>
                    {index === 0 ? '' : timeName.format(new Date(2026, 0, 1, range.start + index))}
                  </span>
                ))}
              </div>

              {weekDays.map((day) => {
                const today = sameDay(day, now);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const nowTop = (hoursOf(now) - range.start) * HOUR_HEIGHT;
                return (
                  <div
                    key={dateKey(day)}
                    className="cal-day"
                    data-today={today || undefined}
                    data-weekend={weekend || undefined}
                    style={{
                      height: (range.end - range.start) * HOUR_HEIGHT,
                      backgroundSize: `100% ${HOUR_HEIGHT}px`,
                    }}
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
                      // Snap the click to the half hour it landed in.
                      const halfHours = Math.floor(
                        ((event.clientY - bounds.top) / HOUR_HEIGHT) * 2,
                      );
                      const date = new Date(day);
                      date.setHours(range.start, halfHours * 30, 0, 0);
                      openSchedule(date);
                    }}
                  >
                    {today && nowTop >= 0 && nowTop <= (range.end - range.start) * HOUR_HEIGHT && (
                      <span className="cal-now" style={{ top: nowTop }} aria-hidden />
                    )}
                    {(byDay.get(dateKey(day)) ?? []).map((interview) => {
                      const h = height(interview);
                      return (
                        <UnstyledButton
                          key={interview.id}
                          className="cal-event"
                          data-compact={h < 44 || undefined}
                          style={{ top: top(interview.startsAt) + 1, height: h }}
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/applications/${interview.applicationId}/interviews`);
                          }}
                        >
                          <span className="cal-event-title">{interview.candidateName}</span>
                          <span className="cal-event-meta">
                            {timeName.format(new Date(interview.startsAt))} · {interview.title}
                          </span>
                        </UnstyledButton>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {canSchedule && (
        <ScheduleInterviewDrawer opened={opened} onClose={drawer.close} selectedDate={scheduleAt} />
      )}
    </>
  );
}
