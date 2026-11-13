'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ClipboardList,
  ChevronRight,
  Clock,
  PencilLine,
  Plus,
  Video,
} from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Button,
  Card,
  CardHeader,
  CellStack,
  EmptyState,
  FilterSelect,
  IconButton,
  IconDisc,
  Input,
  PageHeader,
  SegmentedControl,
  SkeletonRows,
  StatCard,
  StatGrid,
} from '@/components/ui';
import { WeekCalendar, weekOf, type CalendarEvent } from '@/components/calendar/WeekCalendar';
import { StatusBadge } from '@/components/status';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import type { DashboardData } from '@/types';
import { prepHref, type CalendarInterview, type InterviewView } from './interview-links';
import { MonthGrid } from './MonthGrid';
import { ScheduleInterviewDrawer } from './ScheduleInterviewDrawer';

type CalendarConnection = { connected: boolean; provider?: string; accountEmail?: string };

// The working day is always shown; the grid stretches to fit anything booked outside it.
const DAY_START = 8;
const DAY_END = 19;

const timeName = (value: string | Date) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};
const dateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), 28));
const minutes = (item: CalendarInterview) =>
  Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000);

/** "October 12–16, 2026", or across months "Sep 29 – Oct 3, 2026". */
function rangeLabel(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  if (days.length === 1)
    return first.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  if (first.getMonth() === last.getMonth())
    return `${first.toLocaleDateString(undefined, { month: 'long' })} ${first.getDate()}–${last.getDate()}, ${last.getFullYear()}`;
  const short = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${short(first)} – ${short(last)}, ${last.getFullYear()}`;
}

/** Visible hour range: the working day, widened to fit every interview. */
function hourRange(interviews: CalendarInterview[]) {
  let start = DAY_START;
  let end = DAY_END;
  for (const interview of interviews) {
    const from = new Date(interview.startsAt);
    const to = new Date(interview.endsAt);
    start = Math.min(start, from.getHours());
    end = Math.max(
      end,
      from.toDateString() === to.toDateString()
        ? Math.ceil(to.getHours() + to.getMinutes() / 60)
        : 24,
    );
  }
  return { start, end: Math.min(end, 24) };
}

/** Monday-based weeks covering the month; a sixth row only when the month needs it. */
function monthDays(date: Date) {
  const days = weekOf(new Date(date.getFullYear(), date.getMonth(), 1), 42);
  return days[35].getMonth() === date.getMonth() ? days : days.slice(0, 35);
}

const agendaColumns: Column<CalendarInterview>[] = [
  {
    id: 'when',
    header: 'When',
    hideable: false,
    cell: (row) => (
      <CellStack
        primary={new Date(row.startsAt).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}
        secondary={`${timeName(row.startsAt)} · ${minutes(row)} min`}
      />
    ),
    sortValue: (row) => new Date(row.startsAt),
    csv: (row) => row.startsAt,
  },
  {
    id: 'candidate',
    header: 'Candidate',
    cell: (row) => <CellStack primary={row.candidateName} secondary={row.requisitionTitle} />,
    sortValue: (row) => row.candidateName,
  },
  { id: 'title', header: 'Interview', cell: (row) => row.title, sortValue: (row) => row.title },
  {
    id: 'job',
    header: 'Job',
    defaultHidden: true,
    cell: (row) => row.requisitionTitle,
    sortValue: (row) => row.requisitionTitle,
  },
  {
    id: 'interviewers',
    header: 'Interviewers',
    cell: (row) => (
      <span className="block max-w-64 truncate text-fg-muted">
        {row.interviewerEmails.join(', ')}
      </span>
    ),
    csv: (row) => row.interviewerEmails.join('; '),
  },
  {
    id: 'prep',
    header: <span className="sr-only">Prepare</span>,
    label: 'Prepare',
    align: 'right',
    hideable: false,
    cell: (row) => (
      <Link
        href={prepHref(row)}
        onClick={(event) => event.stopPropagation()}
        className="text-sm font-medium text-accent-foreground hover:underline"
      >
        Prepare
      </Link>
    ),
  },
];

export function InterviewsPage({ initialView = 'week' }: { initialView?: InterviewView }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const canSchedule = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [view, setViewState] = useState<InterviewView>(initialView);
  // The view lives in ?view= so it survives reloads and can be linked to.
  const setView = (next: InterviewView) => {
    setViewState(next);
    router.replace(`${pathname}?view=${next}`, { scroll: false });
  };
  const [agendaFrom, setAgendaFrom] = useState(() => dateInput(new Date()));
  const [agendaTo, setAgendaTo] = useState(() => dateInput(addDays(new Date(), 30)));
  const [interviewer, setInterviewer] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Date>(() => new Date());
  const [opened, setOpened] = useState(false);

  const connection = useQuery({
    queryKey: ['calendar-connection'],
    queryFn: () => api.get<CalendarConnection>('/api/calendar/connection'),
  });
  const disconnect = useMutation({
    mutationFn: () => api.delete('/api/calendar/connection'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-connection'] }),
  });
  const connect = async (provider: 'Google' | 'Microsoft') => {
    const result = await api.get<{ authorizationUrl: string }>(`/api/calendar/connect/${provider}`);
    window.location.assign(result.authorizationUrl);
  };
  // Shared with the dashboard: the 7-day count and the feedback this person owes.
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });

  const week = useMemo(() => weekOf(selectedDate, 7), [selectedDate]);
  const month = useMemo(() => monthDays(selectedDate), [selectedDate]);
  // Day and Week share the week's fetch; Month fetches its grid; Agenda its own date range.
  const [from, to] =
    view === 'month'
      ? [month[0], addDays(month[month.length - 1], 1)]
      : view === 'agenda'
        ? [new Date(`${agendaFrom}T00:00:00`), addDays(new Date(`${agendaTo}T00:00:00`), 1)]
        : [week[0], addDays(week[0], 7)];
  // A cleared date input gives an Invalid Date, whose toISOString throws.
  const validRange = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from;
  const query = useQuery({
    queryKey: [
      'interview-calendar',
      validRange ? from.toISOString() : '',
      validRange ? to.toISOString() : '',
    ],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      ),
    enabled: validRange,
  });
  const todayStart = startOfDay(new Date());
  const todayQuery = useQuery({
    queryKey: ['interview-calendar', 'today', todayStart.toISOString()],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(todayStart.toISOString())}&to=${encodeURIComponent(addDays(todayStart, 1).toISOString())}`,
      ),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const interviewers = useMemo(
    () => [...new Set(all.flatMap((item) => item.interviewerEmails))].sort(),
    [all],
  );
  const interviews = interviewer
    ? all.filter((item) => item.interviewerEmails.includes(interviewer))
    : all;
  const range = hourRange(interviews);
  // Weekends only take space when something is booked on them.
  const weekend = interviews.some((item) => [0, 6].includes(new Date(item.startsAt).getDay()));
  const days = view === 'day' ? [startOfDay(selectedDate)] : weekend ? week : week.slice(0, 5);
  const events: CalendarEvent[] = interviews.map((item) => ({
    id: item.id,
    start: new Date(item.startsAt),
    end: new Date(item.endsAt),
    title: item.candidateName,
    subtitle: item.title,
    tone: 'blue',
    onClick: () => router.push(prepHref(item)),
  }));

  const now = new Date();
  const today = todayQuery.data ?? [];
  const nextToday = today.find((item) => new Date(item.startsAt) > now);
  const move = (direction: 1 | -1) =>
    setSelectedDate(
      view === 'month'
        ? addMonths(selectedDate, direction)
        : addDays(selectedDate, direction * (view === 'day' ? 1 : 7)),
    );
  const unit = view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';
  const title =
    view === 'month'
      ? selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'agenda'
        ? 'Agenda'
        : rangeLabel(days);
  const owed = dashboard.data?.scorecardsDue.length ?? 0;
  const openSchedule = (date = selectedDate) => {
    setScheduleAt(date);
    setOpened(true);
  };

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Plan your week, connect with candidates, and keep your team in sync."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/interviews/feedback">
                <ClipboardList />
                My feedback{owed > 0 ? ` (${owed})` : ''}
              </Link>
            </Button>
            {canSchedule && (
              <Button leftIcon={<Plus />} onClick={() => openSchedule()}>
                Schedule interview
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatCard
            icon={CalendarDays}
            tone="blue"
            label={
              view === 'month'
                ? 'Scheduled this month'
                : view === 'agenda'
                  ? 'Scheduled in range'
                  : 'Scheduled this week'
            }
            value={
              query.isLoading
                ? '–'
                : view === 'month'
                  ? all.filter(
                      (item) => new Date(item.startsAt).getMonth() === selectedDate.getMonth(),
                    ).length
                  : all.length
            }
            hint={
              view === 'month'
                ? title
                : view === 'agenda'
                  ? `${agendaFrom} to ${agendaTo}`
                  : rangeLabel(week)
            }
          />
          <StatCard
            icon={Video}
            tone="violet"
            label="Today’s interviews"
            value={todayQuery.isLoading ? '–' : today.length}
            hint={nextToday ? `Next at ${timeName(nextToday.startsAt)}` : 'Nothing left today'}
          />
          <StatCard
            icon={Clock}
            tone="green"
            label="Next 7 days"
            value={dashboard.data?.interviewsThisWeek ?? '–'}
            hint="Scheduled from now"
          />
          <StatCard
            icon={PencilLine}
            tone="amber"
            label="Your feedback due"
            value={dashboard.data?.scorecardsDue.length ?? '–'}
            hint="Scorecards to write"
          />
        </StatGrid>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {view !== 'agenda' && (
                <>
                  <IconButton label={`Previous ${unit}`} size="sm" onClick={() => move(-1)}>
                    <ChevronLeft />
                  </IconButton>
                  <IconButton label={`Next ${unit}`} size="sm" onClick={() => move(1)}>
                    <ChevronRight />
                  </IconButton>
                </>
              )}
              <h2 className="px-1 text-lg font-semibold text-fg">{title}</h2>
              {view !== 'agenda' && (
                <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date())}>
                  Today
                </Button>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {view === 'agenda' ? (
                  <>
                    <Input
                      type="date"
                      size="sm"
                      aria-label="From"
                      className="w-[150px]"
                      value={agendaFrom}
                      onChange={(event) => setAgendaFrom(event.currentTarget.value)}
                    />
                    <span className="text-sm text-fg-subtle">to</span>
                    <Input
                      type="date"
                      size="sm"
                      aria-label="To"
                      className="w-[150px]"
                      value={agendaTo}
                      min={agendaFrom}
                      onChange={(event) => setAgendaTo(event.currentTarget.value)}
                    />
                  </>
                ) : (
                  <Input
                    type="date"
                    size="sm"
                    aria-label="Go to date"
                    className="w-[150px]"
                    value={dateInput(selectedDate)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value) setSelectedDate(new Date(`${value}T12:00:00`));
                    }}
                  />
                )}
                {interviewers.length > 1 && (
                  <FilterSelect
                    allLabel="All interviewers"
                    value={interviewer}
                    onChange={setInterviewer}
                    data={interviewers}
                  />
                )}
                <SegmentedControl
                  aria-label="Calendar view"
                  value={view}
                  onValueChange={(value) => setView(value as InterviewView)}
                  items={[
                    { value: 'day', label: 'Day' },
                    { value: 'week', label: 'Week' },
                    { value: 'month', label: 'Month' },
                    { value: 'agenda', label: 'Agenda' },
                  ]}
                />
              </div>
            </div>
            {view === 'agenda' ? (
              <DataTable
                data={validRange ? interviews : []}
                columns={agendaColumns}
                getRowId={(row) => row.id}
                viewKey="interviews-agenda"
                loading={query.isLoading}
                noun="interview"
                exportName="interviews"
                onRowOpen={(row) => router.push(prepHref(row))}
                rowLabel={(row) => `Prepare for ${row.title} with ${row.candidateName}`}
                empty={
                  <EmptyState
                    compact
                    icon={CalendarDays}
                    title={
                      validRange ? 'Nothing scheduled in this range' : 'Pick a valid date range'
                    }
                    description={
                      validRange
                        ? 'Widen the dates, or schedule an interview.'
                        : 'The end date must come after the start.'
                    }
                    action={
                      canSchedule &&
                      validRange && (
                        <Button
                          variant="soft"
                          size="sm"
                          leftIcon={<CalendarPlus />}
                          onClick={() => openSchedule()}
                        >
                          Schedule interview
                        </Button>
                      )
                    }
                  />
                }
              />
            ) : query.isLoading ? (
              <SkeletonRows rows={6} />
            ) : view === 'month' ? (
              <MonthGrid
                month={selectedDate.getMonth()}
                days={month}
                interviews={interviews}
                onDayOpen={(day) => {
                  setSelectedDate(day);
                  setView('day');
                }}
              />
            ) : (
              <>
                {!events.some((event) =>
                  days.some((day) => day.toDateString() === event.start.toDateString()),
                ) && (
                  <p className="mb-2 text-sm text-fg-subtle">
                    Nothing scheduled {view === 'day' ? 'on this day' : 'this week'}
                    {interviewer ? ' for this interviewer' : ''}.
                  </p>
                )}
                <WeekCalendar
                  days={days}
                  events={events}
                  startHour={range.start}
                  endHour={range.end}
                  onSlotClick={openSchedule}
                />
              </>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader
                title="Today’s interviews"
                action={
                  <span className="text-sm text-accent-foreground tnum">{today.length} total</span>
                }
              />
              {todayQuery.isLoading ? (
                <SkeletonRows rows={3} />
              ) : today.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="Nothing scheduled today"
                  action={
                    canSchedule && (
                      <Button
                        variant="soft"
                        size="sm"
                        leftIcon={<CalendarPlus />}
                        onClick={() => openSchedule(new Date())}
                      >
                        Schedule interview
                      </Button>
                    )
                  }
                />
              ) : (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {today.map((item) => (
                    <li key={item.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-accent-foreground tnum">
                          {timeName(item.startsAt)}
                        </span>
                        <StatusBadge status="Scheduled" size="sm" />
                      </div>
                      <p className="mt-1 truncate text-base font-medium text-fg">
                        {item.candidateName}
                      </p>
                      <p className="truncate text-xs text-fg-muted">{item.requisitionTitle}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-2xs text-fg-subtle">
                        <span className="truncate">
                          {item.title} · {minutes(item)} min
                        </span>
                        <Link
                          href={prepHref(item)}
                          className="shrink-0 font-medium text-accent-foreground hover:underline"
                        >
                          Prepare
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title={connection.data?.connected ? 'Calendar connected' : 'Connect your calendar'}
                description={
                  connection.data?.connected ? undefined : 'Booking checks your real availability.'
                }
              />
              <div className="flex flex-col gap-3 px-5 pb-5">
                {connection.data?.connected && (
                  <div className="flex items-center gap-3">
                    <IconDisc icon={CalendarCheck} tone="green" size="sm" />
                    <div className="min-w-0">
                      <p className="text-base font-medium text-fg">
                        {connection.data.provider} Calendar
                      </p>
                      {connection.data.accountEmail && (
                        <p className="truncate text-xs text-fg-subtle">
                          {connection.data.accountEmail}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => connect('Google')}>
                    {connection.data?.provider === 'Google' ? 'Reconnect Google' : 'Connect Google'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => connect('Microsoft')}>
                    {connection.data?.provider === 'Microsoft'
                      ? 'Reconnect Microsoft'
                      : 'Connect Microsoft'}
                  </Button>
                  {connection.data?.connected && (
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      loading={disconnect.isPending}
                      onClick={() => disconnect.mutate()}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {canSchedule && (
        <ScheduleInterviewDrawer
          opened={opened}
          onClose={() => setOpened(false)}
          selectedDate={scheduleAt}
        />
      )}
    </>
  );
}
