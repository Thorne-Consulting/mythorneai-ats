'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  CellStack,
  CopyButton,
  CountBadge,
  EmptyState,
  FilterSelect,
  IconButton,
  Input,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  SkeletonRows,
  Switch,
} from '@/components/ui';
import { WeekCalendar, weekOf, type CalendarEvent } from '@/components/calendar/WeekCalendar';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { asJob, useAbility } from '@/lib/ability';
import { useLocalStorageState } from '@/lib/hooks';
import { safeWebUrl } from '@/lib/safe-url';
import {
  interviewHref,
  responsesOf,
  useCalendarRange,
  type AttentionData,
  type CalendarInterview,
} from './interview-api';
import { scheduleHref, type InterviewView } from './interview-links';
import { browserZone, fromNow, interviewState, rangeText, zoneName } from './interview-state';
import { MonthGrid } from './MonthGrid';
import type { RequisitionSummary } from '@/types';

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
const names = (item: CalendarInterview) =>
  item.interviewers.map((person) => person.name).join(', ');

/** "November 9–13, 2026", or across months "Sep 29 – Oct 3, 2026". */
function rangeLabel(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  if (days.length === 1)
    return first.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
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
    csv: (row) => `${row.candidateName} (${row.requisitionTitle})`,
  },
  { id: 'title', header: 'Interview', cell: (row) => row.title, sortValue: (row) => row.title },
  {
    id: 'interviewers',
    header: 'Interviewers',
    cell: (row) => <span className="block max-w-64 truncate text-fg-muted">{names(row)}</span>,
    csv: (row) => names(row),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => {
      const state = interviewState(row.status, row.startsAt, row.endsAt);
      return (
        <Badge tone={state.tone} dot size="sm">
          {state.label}
        </Badge>
      );
    },
    sortValue: (row) => interviewState(row.status, row.startsAt, row.endsAt).label,
    csv: (row) => interviewState(row.status, row.startsAt, row.endsAt).label,
  },
];

export function InterviewsPage({ initialView }: { initialView?: InterviewView }) {
  const router = useRouter();
  const pathname = usePathname();
  const ability = useAbility();
  const canSchedule = ability.can('schedule', 'Interview');
  // Rescheduling and cancelling belong to the job's hiring managers and recruiters.
  const jobs = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
    enabled: canSchedule,
  });
  const managesJob = (id: string) => {
    const job = jobs.data?.find((row) => row.id === id);
    return Boolean(job) && ability.can('update', asJob(job!));
  };
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [view, setViewState] = useState<InterviewView>(initialView ?? 'week');
  // Phones open on the agenda, unless a view was asked for in the address.
  useEffect(() => {
    if (!initialView && window.matchMedia('(max-width: 767px)').matches) setViewState('agenda');
  }, [initialView]);
  // The view lives in ?view= so it survives reloads and can be linked to.
  const setView = (next: InterviewView) => {
    setViewState(next);
    router.replace(`${pathname}?view=${next}`, { scroll: false });
  };
  const [scope, setScope] = useLocalStorageState<'mine' | 'team'>(
    'interviews:scope',
    canSchedule ? 'team' : 'mine',
  );
  const mine = !canSchedule || scope === 'mine';
  const [showCancelled, setShowCancelled] = useLocalStorageState(
    'interviews:show-cancelled',
    false,
  );
  const [agendaFrom, setAgendaFrom] = useState(() => dateInput(new Date()));
  const [agendaTo, setAgendaTo] = useState(() => dateInput(addDays(new Date(), 30)));
  const [interviewer, setInterviewer] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const week = useMemo(() => weekOf(selectedDate, 7), [selectedDate]);
  const month = useMemo(() => monthDays(selectedDate), [selectedDate]);
  // Day and Week share the week's fetch; Month fetches its grid; Agenda its own date range.
  const [from, to] =
    view === 'month'
      ? [month[0], addDays(month[month.length - 1], 1)]
      : view === 'agenda'
        ? [new Date(`${agendaFrom}T00:00:00`), addDays(new Date(`${agendaTo}T00:00:00`), 1)]
        : [week[0], addDays(week[0], 7)];
  const validRange = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from;
  const query = useCalendarRange(from, to, { mine });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const interviewerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of all)
      for (const person of item.interviewers) seen.set(person.email, person.name);
    return [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  const interviews = all.filter(
    (item) =>
      (showCancelled || item.status !== 'Cancelled') &&
      (!interviewer || item.interviewerEmails.includes(interviewer)),
  );
  const range = hourRange(interviews);
  // Weekends only take space when something is booked on them.
  const weekend = interviews.some((item) => [0, 6].includes(new Date(item.startsAt).getDay()));
  const days = view === 'day' ? [startOfDay(selectedDate)] : weekend ? week : week.slice(0, 5);
  const events: CalendarEvent[] = interviews.map((item) => {
    const state = interviewState(item.status, item.startsAt, item.endsAt, now);
    return {
      id: item.id,
      start: new Date(item.startsAt),
      end: new Date(item.endsAt),
      title: item.candidateName,
      subtitle: item.title,
      tone: state.tone,
      look: state.look,
      label: `${item.title} with ${item.candidateName}, ${timeName(item.startsAt)}, ${state.label}`,
      popover: <EventDetails item={item} canManage={managesJob(item.requisitionId)} now={now} />,
      onOpen: () => router.push(interviewHref(item.id)),
    };
  });

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
      : rangeLabel(days);
  const openSchedule = (date?: Date) =>
    router.push(
      scheduleHref(
        date && date > new Date()
          ? {
              date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            }
          : {},
      ),
    );
  const due = useQuery({
    queryKey: ['interviews', 'my-scorecards-due'],
    queryFn: () => api.get<{ counts: { due: number } }>('/api/me/scorecards'),
  });
  const filtersOn = (interviewer ? 1 : 0) + (showCancelled ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Interviews"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/interviews/feedback">
                <ClipboardList />
                My feedback
                {!!due.data?.counts.due && <CountBadge count={due.data.counts.due} tone="amber" />}
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

      <CalendarNudge />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {view === 'agenda' ? (
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:w-auto">
                <Input
                  type="date"
                  size="sm"
                  aria-label="From"
                  className="w-full sm:w-[150px]"
                  value={agendaFrom}
                  onChange={(event) => setAgendaFrom(event.currentTarget.value)}
                />
                <span className="text-sm text-fg-subtle">to</span>
                <Input
                  type="date"
                  size="sm"
                  aria-label="To"
                  className="w-full sm:w-[150px]"
                  value={agendaTo}
                  min={agendaFrom}
                  onChange={(event) => setAgendaTo(event.currentTarget.value)}
                />
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <IconButton label={`Previous ${unit}`} size="sm" onClick={() => move(-1)}>
                  <ChevronLeft />
                </IconButton>
                <IconButton label={`Next ${unit}`} size="sm" onClick={() => move(1)}>
                  <ChevronRight />
                </IconButton>
                <h2 className="truncate px-1 text-lg font-semibold text-fg">{title}</h2>
                <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date())}>
                  Today
                </Button>
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canSchedule && (
                <SegmentedControl
                  aria-label="Whose interviews"
                  value={scope}
                  onValueChange={(value) => {
                    setScope(value as 'mine' | 'team');
                    setInterviewer(null);
                  }}
                  items={[
                    { value: 'mine', label: 'Mine' },
                    { value: 'team', label: 'Team' },
                  ]}
                />
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" leftIcon={<SlidersHorizontal />}>
                    Filter
                    {filtersOn > 0 && <CountBadge count={filtersOn} tone="blue" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="space-y-4">
                  {!mine && interviewerOptions.length > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-fg">Interviewer</p>
                      <FilterSelect
                        allLabel="Everyone"
                        className="w-full"
                        value={interviewer}
                        onChange={setInterviewer}
                        data={interviewerOptions}
                      />
                    </div>
                  )}
                  <Switch
                    checked={showCancelled}
                    onCheckedChange={setShowCancelled}
                    label="Show cancelled interviews"
                  />
                </PopoverContent>
              </Popover>
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
          <p className="mb-3 text-xs text-fg-subtle">Times in {zoneName(browserZone())}</p>
          {view === 'agenda' ? (
            <DataTable
              data={validRange ? interviews : []}
              columns={agendaColumns}
              getRowId={(row) => row.id}
              viewKey="interviews-agenda"
              loading={query.isLoading}
              noun="interview"
              exportName="interviews"
              onRowOpen={(row) => router.push(interviewHref(row.id))}
              rowLabel={(row) => `Open ${row.title} with ${row.candidateName}`}
              card={(row) => <AgendaCard item={row} />}
              empty={
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title={validRange ? 'Nothing scheduled in these dates' : 'Check the dates'}
                  description={
                    validRange
                      ? 'Try a wider date range.'
                      : 'The end date must be after the start date.'
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
                today={now}
                onSlotClick={canSchedule ? openSchedule : undefined}
              />
            </>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <UpNext now={now} />
          {canSchedule && <NeedsAttention />}
        </div>
      </div>
    </>
  );
}

/** The calendar's popover: who, when, where, and the next step. */
function EventDetails({
  item,
  canManage,
  now,
}: {
  item: CalendarInterview;
  canManage: boolean;
  now: Date;
}) {
  const state = interviewState(item.status, item.startsAt, item.endsAt, now);
  const link = safeWebUrl(item.meetingLink);
  const active = state.key === 'upcoming' || state.key === 'live' || state.key === 'waiting';
  return (
    <div className="space-y-3">
      <div>
        <Badge tone={state.tone} dot size="sm">
          {state.label}
        </Badge>
        <p className="mt-2 text-md font-semibold text-fg">{item.candidateName}</p>
        <p className="text-sm text-fg-muted">
          {item.title} · {item.requisitionTitle}
        </p>
      </div>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="sr-only">When</dt>
          <dd className="text-fg">{rangeText(item.startsAt, item.endsAt)}</dd>
        </div>
        <div>
          <dt className="sr-only">Interviewers</dt>
          <dd className="text-fg-muted">With {names(item)}</dd>
        </div>
        {item.cancelReason && (
          <div>
            <dt className="sr-only">Reason</dt>
            <dd className="text-fg-muted">{item.cancelReason}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {link && active && (
          <Button asChild size="sm">
            <a href={link} target="_blank" rel="noreferrer">
              Join
              <ExternalLink />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="secondary">
          <Link href={interviewHref(item.id)}>{active ? 'Prepare' : 'Open'}</Link>
        </Button>
        {canManage && active && (
          <>
            <Button asChild size="sm" variant="quiet">
              <Link href={scheduleHref({ interview: item.id })}>Reschedule</Link>
            </Button>
            <Button asChild size="sm" variant="danger-quiet">
              <Link href={`${interviewHref(item.id)}?do=cancel`}>Cancel</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** A phone's agenda row. */
function AgendaCard({ item }: { item: CalendarInterview }) {
  const state = interviewState(item.status, item.startsAt, item.endsAt);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted tnum">
          {new Date(item.startsAt).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}{' '}
          · {timeName(item.startsAt)}
        </p>
        <Badge tone={state.tone} dot size="sm">
          {state.label}
        </Badge>
      </div>
      <p className="text-base font-semibold text-fg">{item.candidateName}</p>
      <p className="text-sm text-fg-muted">
        {item.title} · {item.requisitionTitle}
      </p>
    </div>
  );
}

/** My next three interviews, with a countdown and the way in. */
function UpNext({ now }: { now: Date }) {
  const start = useMemo(() => startOfDay(new Date()), []);
  const query = useCalendarRange(start, addDays(start, 15), { mine: true });
  const next = (query.data ?? [])
    .filter((item) => item.status === 'Scheduled' && new Date(item.endsAt) > now)
    .slice(0, 3);
  return (
    <Card>
      <CardHeader title="Up next for you" />
      {query.isLoading ? (
        <SkeletonRows rows={3} />
      ) : next.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-subtle">
          You have no interviews in the next two weeks.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {next.map((item) => {
            const state = interviewState(item.status, item.startsAt, item.endsAt, now);
            const link = safeWebUrl(item.meetingLink);
            const soon =
              state.key === 'live' ||
              new Date(item.startsAt).getTime() - now.getTime() < 15 * 60_000;
            const day = new Date(item.startsAt);
            return (
              <li key={item.id} className="space-y-1 px-5 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-accent-foreground tnum">
                    {day.toDateString() === now.toDateString()
                      ? timeName(day)
                      : `${day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeName(day)}`}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {state.key === 'live' ? 'Live now' : fromNow(item.startsAt, now)}
                  </span>
                </div>
                <p className="truncate text-base font-medium text-fg">{item.candidateName}</p>
                <p className="truncate text-xs text-fg-muted">
                  {item.title} · {item.requisitionTitle}
                </p>
                <div className="flex gap-2 pt-1">
                  {link && soon && (
                    <Button asChild size="xs">
                      <a href={link} target="_blank" rel="noreferrer">
                        Join
                        <span className="sr-only"> {item.title} (opens in a new tab)</span>
                      </a>
                    </Button>
                  )}
                  <Button asChild size="xs" variant="secondary">
                    <Link href={interviewHref(item.id)}>Prepare</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** What a recruiter has to act on: outcomes, calendar problems, and times waiting on the candidate. */
function NeedsAttention() {
  const query = useQuery({
    queryKey: ['interview-attention'],
    queryFn: () => api.get<AttentionData>('/api/interviews/attention'),
  });
  const groups: [string, CalendarInterview[], (item: CalendarInterview) => string][] = query.data
    ? [
        ['Say how it went', query.data.needsOutcome, (item) => `Ended ${fromNow(item.endsAt)}`],
        [
          'Calendar invite failed',
          query.data.calendarProblems,
          (item) => `Starts ${fromNow(item.startsAt)}`,
        ],
        [
          'Someone declined',
          query.data.declined ?? [],
          (item) => {
            const responses = responsesOf(item.attendeeResponsesJson);
            const who = item.interviewers.filter(
              (person) => responses[person.email] === 'declined',
            );
            return `${who.map((person) => person.name).join(', ') || 'An invitee'} declined · starts ${fromNow(item.startsAt)}`;
          },
        ],
        [
          'Waiting for the candidate',
          query.data.waitingForCandidate,
          (item) =>
            `Offered for ${new Date(item.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        ],
      ]
    : [];
  const links = query.data?.openLinks ?? [];
  const total = groups.reduce((sum, [, items]) => sum + items.length, 0) + links.length;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Needs attention
            {total > 0 && <CountBadge count={total} tone="amber" />}
          </span>
        }
      />
      {query.isLoading ? (
        <SkeletonRows rows={2} />
      ) : total === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-subtle">Nothing needs you right now.</p>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          {groups
            .filter(([, items]) => items.length > 0)
            .map(([label, items, meta]) => (
              <section key={label}>
                <h3 className="text-xs font-medium text-fg-subtle">
                  {label} <span className="tnum">({items.length})</span>
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {items.slice(0, 4).map((item) => (
                    <li key={item.id}>
                      <Link
                        href={interviewHref(item.id)}
                        className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="block truncate text-sm font-medium text-fg">
                          {item.candidateName} · {item.title}
                        </span>
                        <span className="block text-xs text-fg-subtle">{meta(item)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {items.length > 4 && (
                  <p className="mt-1 text-xs text-fg-subtle">And {items.length - 4} more</p>
                )}
              </section>
            ))}
          {links.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-fg-subtle">
                Scheduling links not used yet <span className="tnum">({links.length})</span>
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {links.slice(0, 4).map((link) => (
                  <li
                    key={link.id}
                    className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <Link
                      href={`/applications/${link.applicationId}/interviews`}
                      className="min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="block truncate text-sm font-medium text-fg">
                        {link.candidateName} · {link.title}
                      </span>
                      <span className="block text-xs text-fg-subtle">
                        Sent {fromNow(link.createdAt)}
                      </span>
                    </Link>
                    <CopyButton
                      value={
                        link.url.startsWith('/') ? `${window.location.origin}${link.url}` : link.url
                      }
                      label={`Copy the scheduling link for ${link.candidateName}`}
                    />
                  </li>
                ))}
              </ul>
              {links.length > 4 && (
                <p className="mt-1 text-xs text-fg-subtle">And {links.length - 4} more</p>
              )}
            </section>
          )}
        </div>
      )}
    </Card>
  );
}

/** Once, until dismissed: connect a calendar so interviews land on it and busy times are known. */
function CalendarNudge() {
  const connection = useQuery({
    queryKey: ['calendar-connection'],
    queryFn: () => api.get<{ connected: boolean }>('/api/calendar/connection'),
  });
  const [dismissed, setDismissed] = useLocalStorageState(
    'interviews:calendar-nudge-dismissed',
    false,
  );
  if (dismissed || !connection.data || connection.data.connected) return null;
  return (
    <Alert
      className="mb-4"
      tone="info"
      title="Connect your calendar"
      onDismiss={() => setDismissed(true)}
    >
      <p>Interviews go on it, and nobody books you when you are busy.</p>
      <Button asChild size="sm" variant="secondary" className="mt-2">
        <Link href="/settings/availability">Connect calendar</Link>
      </Button>
    </Alert>
  );
}
