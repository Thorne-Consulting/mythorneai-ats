'use client';

import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  FileText,
  PencilLine,
  SlidersHorizontal,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardLink,
  Drawer,
  EmptyState,
  IconButton,
  IconDisc,
  PageHeader,
  Progress,
  SegmentedControl,
  SkeletonRows,
  StatCard,
  SortableList,
  StatGrid,
  Switch,
  Tabs,
  toast,
  toneDot,
  type Tone,
} from '@/components/ui';
import { DonutChart } from '@/components/ui/chart';
import { PipelineBar } from '@/components/pipeline/PipelineBar';
import { stageTone, stageTypes } from '@/components/status';
import { canManageWorkspace, useAbility } from '@/lib/ability';
import { cn } from '@/lib/cn';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import {
  buildNotifications,
  useDoneNotifications,
  type NotificationItem,
} from '@/features/notifications/notification-items';
import { useLocalStorageState } from '@/lib/hooks';
import type { DashboardData, RequisitionSummary } from '@/types';
import { ActivityList } from './ActivityList';
import { InterviewerHome } from './InterviewerHome';
import { useDashboardLayout } from './dashboard-layout';
import { WIDGETS, defaultLayout, moveWidget, type WidgetId } from './widget-layout';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Step = { key: string; title: string; detail: string; done: boolean; href: string };

// Same shape as the reports API; only the sources report is read here.
type SourcesReport = { rows: (string | number | null)[][] };

type CalendarInterview = DashboardData['upcomingInterviews'][number] & {
  interviewerEmails: string[];
};

const stageIcons: Record<Tone, LucideIcon> = {
  gray: FileText,
  violet: Users,
  blue: CalendarDays,
  amber: FileText,
  green: CheckCircle2,
  red: FileText,
};

// Full-width widgets span the grid; the rest sit two-thirds or one-third wide and pack densely.
const widgetSpan: Record<WidgetId, string> = {
  stats: 'lg:col-span-3',
  setup: 'lg:col-span-3',
  pipeline: 'lg:col-span-2',
  recent: 'lg:col-span-2',
  jobs: 'lg:col-span-2',
  sources: 'lg:col-span-1',
  upcoming: 'lg:col-span-1',
  waiting: 'lg:col-span-1',
};

const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export type Period = 'week' | 'month' | 'quarter';
const periodDays: Record<Period, number> = { week: 7, month: 30, quarter: 90 };

export function DashboardPage({ initialData }: { initialData: DashboardData }) {
  const user = useCurrentUser();
  const ability = useAbility();
  const [period, setPeriod] = useLocalStorageState<Period>('ats-dashboard-period', 'month');
  const query = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api.get<DashboardData>(`/api/dashboard?period=${period}`),
    // The server page loads the default period.
    initialData: period === 'month' ? initialData : undefined,
    placeholderData: (previous) => previous,
  });
  const firstName = user.displayName.split(' ')[0];

  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  // People without jobs (interviewers) get their interviews and feedback, not the team view.
  if (!ability.can('read', 'Job'))
    return <InterviewerHome data={query.data} firstName={firstName} greeting={greeting()} />;
  return (
    <TeamDashboard
      data={query.data}
      firstName={firstName}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}

function TeamDashboard({
  data,
  firstName,
  period,
  onPeriodChange,
}: {
  data: DashboardData;
  firstName: string;
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const user = useCurrentUser();
  const [tab, setTab] = useLocalStorageState<'mine' | 'team'>(
    'ats-dashboard-tab',
    user.role === 'HiringManager' ? 'mine' : 'team',
  );
  const { layout: stored, setLayout: setStored } = useDashboardLayout(user.role);
  const ability = useAbility();
  // Cards you may not see (setup steps, the sources report) stay out of the grid and Customize.
  const allowed = (id: WidgetId) =>
    (id !== 'setup' || canManageWorkspace(ability)) &&
    (id !== 'sources' || ability.can('read', 'Report'));
  const layout = { ...stored, order: stored.order.filter(allowed) };
  const [customizing, setCustomizing] = useState(false);
  const approvals = usePendingApprovals();
  const [done] = useDoneNotifications();
  const needs = buildNotifications(data, approvals.data).filter((item) => !done.has(item.key));

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${firstName} 👋`}
        title="Welcome back to MyThorneAI"
        actions={
          <>
            <p className="text-sm text-fg-subtle max-sm:hidden">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            {tab === 'team' && (
              <>
                <SegmentedControl
                  aria-label="Period"
                  value={period}
                  onValueChange={(value) => onPeriodChange(value as Period)}
                  items={[
                    { value: 'week', label: '7 days' },
                    { value: 'month', label: '30 days' },
                    { value: 'quarter', label: '90 days' },
                  ]}
                />
                <Button
                  variant="secondary"
                  leftIcon={<SlidersHorizontal />}
                  onClick={() => setCustomizing(true)}
                >
                  Customize
                </Button>
              </>
            )}
          </>
        }
      >
        <Tabs
          aria-label="Dashboard"
          value={tab}
          onValueChange={(value) => setTab(value as 'mine' | 'team')}
          items={[
            { value: 'mine', label: 'My work', count: needs.length },
            { value: 'team', label: 'Team' },
          ]}
        />
      </PageHeader>

      {tab === 'mine' ? (
        <MyWork data={data} needs={needs} />
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-3">
          {layout.order
            .filter((id) => !layout.hidden.includes(id))
            .map((id) => (
              <Widget
                key={id}
                id={id}
                data={data}
                needs={needs}
                period={period}
                onHideSetup={() => {
                  setStored({ ...layout, hidden: [...layout.hidden, 'setup'] });
                  toast.success(
                    'Setup steps hidden',
                    'Bring them back from Customize at the top of the dashboard.',
                  );
                }}
              />
            ))}
        </div>
      )}

      <Drawer
        opened={customizing}
        onClose={() => setCustomizing(false)}
        title="Customize dashboard"
        description="Pick which cards show on the Team tab. Drag a card, or use the arrows, to change the order."
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setStored(defaultLayout(user.role))}>
              Reset to default
            </Button>
            <Button onClick={() => setCustomizing(false)}>Done</Button>
          </>
        }
      >
        <SortableList
          id="dashboard-cards"
          items={layout.order}
          getKey={(id) => id}
          getLabel={(id) => WIDGETS[id]}
          onReorder={(order) => setStored({ ...layout, order })}
          itemClassName="py-1.5 pr-2 pl-1"
          renderItem={(id, handle, index) => (
            <div className="flex items-center gap-2">
              {handle}
              <Switch
                className="flex-1"
                label={WIDGETS[id]}
                checked={!layout.hidden.includes(id)}
                onCheckedChange={(on) =>
                  setStored({
                    ...layout,
                    hidden: on
                      ? layout.hidden.filter((hidden) => hidden !== id)
                      : [...layout.hidden, id],
                  })
                }
              />
              <IconButton
                size="sm"
                variant="quiet"
                label={`Move ${WIDGETS[id]} up`}
                disabled={index === 0}
                onClick={() => setStored({ ...layout, order: moveWidget(layout.order, id, -1) })}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                size="sm"
                variant="quiet"
                label={`Move ${WIDGETS[id]} down`}
                disabled={index === layout.order.length - 1}
                onClick={() => setStored({ ...layout, order: moveWidget(layout.order, id, 1) })}
              >
                <ArrowDown />
              </IconButton>
            </div>
          )}
        />
      </Drawer>
    </>
  );
}

/** "My work": only what is assigned to or waiting on the signed-in user. */
function MyWork({ data, needs }: { data: DashboardData; needs: NotificationItem[] }) {
  const user = useCurrentUser();
  const email = user.email.toLowerCase();
  const [range] = useState(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const interviews = useQuery({
    queryKey: ['interviews', 'mine', range.from],
    queryFn: () =>
      api.get<CalendarInterview[]>(
        `/api/interviews?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&status=Scheduled`,
      ),
  });
  const jobs = useQuery({
    queryKey: ['requisitions-list'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  const myInterviews = (interviews.data ?? []).filter((item) =>
    item.interviewerEmails.some((address) => address.toLowerCase() === email),
  );
  const myJobs = (jobs.data ?? []).filter(
    (job) =>
      ['Open', 'PendingApproval'].includes(job.status) &&
      [job.ownerEmail, job.recruiterEmail].some((address) => address?.toLowerCase() === email),
  );

  return (
    <div className="flex flex-col gap-4">
      <StatGrid className="sm:grid-cols-3 xl:grid-cols-3">
        <StatCard
          href="/notifications"
          icon={PencilLine}
          tone="blue"
          label="Feedback to submit"
          value={data.scorecardsDue.length}
        />
        <StatCard
          href="/interviews"
          icon={CalendarDays}
          tone="green"
          label="My interviews"
          value={interviews.isLoading ? '…' : myInterviews.length}
          hint="Next 7 days"
        />
        <StatCard
          href="/jobs"
          icon={Briefcase}
          tone="violet"
          label="My open jobs"
          value={jobs.isLoading ? '…' : myJobs.length}
          hint="Jobs you own or recruit for"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <WaitingCard needs={needs} limit={10} />
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="My interviews"
              action={<CardLink href="/interviews">Calendar</CardLink>}
            />
            {interviews.isLoading ? (
              <SkeletonRows rows={3} />
            ) : (
              <InterviewList
                items={myInterviews}
                empty="You have no interviews in the next 7 days."
              />
            )}
          </Card>
          <Card>
            <CardHeader title="My jobs" action={<CardLink href="/jobs">All jobs</CardLink>} />
            {jobs.isLoading ? (
              <SkeletonRows rows={3} />
            ) : myJobs.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-subtle">
                You don’t own or recruit for any open jobs.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {myJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-fg">
                          {job.title}
                        </span>
                        <span className="block truncate text-xs text-fg-subtle">
                          {job.code}
                          {job.status === 'PendingApproval' && ' · waiting for approval'}
                        </span>
                      </span>
                      <span className="text-sm text-fg-muted tnum">
                        {job.activeApplications} active
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Widget({
  id,
  data,
  needs,
  period,
  onHideSetup,
}: {
  id: WidgetId;
  data: DashboardData;
  needs: NotificationItem[];
  period: Period;
  onHideSetup: () => void;
}) {
  const span = widgetSpan[id];
  switch (id) {
    case 'stats':
      return <StatsWidget data={data} className={span} />;
    case 'setup':
      return <SetupWidget className={span} onHide={onHideSetup} />;
    case 'pipeline':
      return <PipelineWidget data={data} className={span} />;
    case 'sources':
      return <SourcesWidget className={span} period={period} />;
    case 'recent':
      return <ActivityWidget className={span} />;
    case 'jobs':
      return <JobsWidget data={data} className={span} />;
    case 'upcoming':
      return (
        <Card className={span}>
          <CardHeader title="Coming up" action={<CardLink href="/interviews">View all</CardLink>} />
          <InterviewList
            items={data.upcomingInterviews}
            empty="No interviews in the next 7 days."
          />
        </Card>
      );
    case 'waiting':
      return (
        <div className={span}>
          <WaitingCard
            needs={needs}
            limit={6}
            more={data.stalledTotal - Math.min(data.stalled.length, 6)}
          />
        </div>
      );
  }
}

/** "↑ 3 versus the 30 days before", or nothing when there is no change. */
function trendOf(now: number | undefined, before: number | undefined, days: number) {
  if (now === undefined || before === undefined || now === before) return undefined;
  return {
    direction: now > before ? ('up' as const) : ('down' as const),
    text: `${Math.abs(now - before)} versus the ${days} days before`,
    good: now > before,
  };
}

function StatsWidget({ data, className }: { data: DashboardData; className: string }) {
  const days = data.period ?? 30;
  return (
    <StatGrid className={className}>
      <StatCard
        href="/jobs"
        icon={Briefcase}
        tone="blue"
        label="Open jobs"
        value={data.openRequisitions}
      />
      <StatCard
        href="/candidates"
        icon={Users}
        tone="violet"
        label="Active candidates"
        value={data.activeCandidates}
        hint={
          data.applied !== undefined
            ? `${data.applied} applied in the last ${days} days`
            : undefined
        }
      />
      <StatCard
        href="/interviews"
        icon={CalendarDays}
        tone="green"
        label="Interviews"
        value={data.interviewsThisWeek}
        hint="Next 7 days"
      />
      <StatCard
        href="/reports/hires"
        icon={Trophy}
        tone="amber"
        label="Hires"
        value={data.hires ?? 0}
        hint={`Last ${days} days`}
        trend={trendOf(data.hires, data.hiresBefore, days)}
      />
    </StatGrid>
  );
}

/**
 * The admin's setup steps. Once most are done it folds to one line; "Hide for now" takes it off
 * the dashboard (saved with the account; Customize brings it back).
 */
function SetupWidget({ className, onHide }: { className: string; onHide: () => void }) {
  const [expanded, setExpanded] = useState(false);
  // Only rendered for people who manage the workspace (see TeamDashboard).
  const checklist = useQuery({
    queryKey: ['admin', 'setup-checklist'],
    queryFn: () => api.get<Step[]>('/api/admin/setup-checklist'),
    retry: false,
  });
  const steps = checklist.data ?? [];
  const pending = steps.filter((step) => !step.done);
  if (pending.length === 0) return null;
  const done = steps.length - pending.length;
  // Folded once three quarters are done, unless opened.
  const folded = done / steps.length >= 0.75 && !expanded;
  return (
    <Card className={className}>
      <CardHeader
        title="Finish setting up"
        description={`${done} of ${steps.length} done`}
        action={
          <div className="flex items-center gap-1">
            {done / steps.length >= 0.75 && (
              <Button variant="quiet" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded
                  ? 'Show less'
                  : `Show ${pending.length === 1 ? 'the last step' : `${pending.length} steps`}`}
              </Button>
            )}
            <Button variant="quiet" size="sm" onClick={onHide}>
              Hide for now
            </Button>
          </div>
        }
      />
      <div className={cn('px-5', folded ? 'pb-5' : 'pb-2')}>
        <Progress value={done} max={steps.length} size="sm" label="Setup progress" />
      </div>
      {!folded && (
        <ul className="divide-y divide-border-subtle">
          {pending.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-fg">{step.title}</span>
                  <span className="block text-xs text-fg-subtle">{step.detail}</span>
                </span>
                <span className="text-sm font-medium text-accent-foreground">Set up</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Share of people who went on from one step to the next, or null with nobody to count. */
const conversion = (from?: number, to?: number) =>
  from && to !== undefined ? Math.round((to / from) * 100) : null;

function PipelineWidget({ data, className }: { data: DashboardData; className: string }) {
  const days = data.period ?? 30;
  // Hired shows the hires in the period; the other steps show who is there now.
  const steps = data.pipeline.map((step) =>
    step.type === 'Hired' ? { ...step, count: data.hires ?? 0 } : step,
  );
  const total = steps.reduce((sum, step) => sum + step.count, 0);
  const most = Math.max(1, ...steps.map((step) => step.count));
  // Each step opens the people behind its number; hires open the hires report.
  const stepHref = (type?: string) =>
    type === 'Hired' ? '/reports/hires' : `/candidates/active?stageType=${type}&openJobs=true`;
  const focus = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none';
  return (
    <Card className={className}>
      <CardHeader
        title="Hiring pipeline"
        description={`Active people on open jobs. Percentages: of those who applied in the last ${days} days, how many went on to the next step.`}
        action={<CardLink href="/pipeline">View pipeline</CardLink>}
      />
      <div className="px-5 pb-5">
        {total === 0 ? (
          <p className="text-sm text-fg-subtle">No active applications yet.</p>
        ) : (
          <>
            <ol className="hidden items-center gap-1 sm:flex">
              {steps.map((step, index) => {
                const tone = stageTone(step.type);
                const rate = index > 0 ? conversion(steps[index - 1].reached, step.reached) : null;
                return (
                  <Fragment key={step.stage}>
                    {index > 0 && (
                      <li
                        aria-hidden={rate === null}
                        className="flex w-9 shrink-0 flex-col items-center text-2xs text-fg-subtle tnum"
                      >
                        <ArrowRight className="size-3.5" aria-hidden />
                        {rate !== null && (
                          <span title="Went on from the step before">
                            {rate}%<span className="sr-only"> went on to {step.stage}</span>
                          </span>
                        )}
                      </li>
                    )}
                    <li className="min-w-0 flex-1">
                      <Link
                        href={stepHref(step.type)}
                        aria-label={`${step.stage}: ${step.count}. Show them`}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-lg border border-border-subtle bg-muted px-2 py-4 text-center transition-colors hover:border-border hover:bg-accent',
                          focus,
                        )}
                      >
                        <IconDisc icon={stageIcons[tone]} tone={tone} size="md" />
                        <span className="w-full truncate text-sm font-medium text-fg">
                          {step.stage}
                        </span>
                        <span className="text-2xl font-bold text-fg tnum">{step.count}</span>
                      </Link>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
            <ul className="flex flex-col gap-2.5 sm:hidden">
              {steps.map((step, index) => {
                const rate = index > 0 ? conversion(steps[index - 1].reached, step.reached) : null;
                return (
                  <li key={step.stage}>
                    <Link
                      href={stepHref(step.type)}
                      className={cn(
                        '-mx-2 grid grid-cols-[88px_1fr_auto] items-center gap-3 rounded-md px-2 py-1 hover:bg-accent',
                        focus,
                      )}
                    >
                      <span className="truncate text-sm text-fg">{step.stage}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn('block h-full rounded-full', toneDot(stageTone(step.type)))}
                          // Dynamic share of the largest step.
                          style={{ width: `${(step.count / most) * 100}%` }}
                        />
                      </span>
                      <span className="text-right text-sm font-semibold text-fg tnum">
                        {step.count}
                        {rate !== null && (
                          <span className="ml-1.5 text-2xs font-normal text-fg-subtle">
                            {rate}%
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function SourcesWidget({ className, period }: { className: string; period: Period }) {
  const range =
    period === 'week'
      ? `from=${new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)}`
      : `range=${period === 'quarter' ? '90d' : '30d'}`;
  const sources = useQuery({
    queryKey: ['report', 'sources', 'dashboard', period],
    queryFn: () => api.get<SourcesReport>(`/api/reports/sources?${range}`),
    retry: false,
  });
  const slices = (sources.data?.rows ?? [])
    .map((row) => ({ name: String(row[0] ?? 'Unknown'), value: Number(row[1] ?? 0) }))
    .filter((slice) => slice.value > 0);
  if (slices.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader
        title="Candidate sources"
        description={`Applications in the last ${periodDays[period]} days`}
        action={<CardLink href="/reports/sources">View report</CardLink>}
      />
      <div className="px-5 pb-5">
        <DonutChart
          data={slices.slice(0, 6)}
          centerValue={slices.reduce((sum, slice) => sum + slice.value, 0)}
          centerLabel="Candidates"
          size={150}
        />
      </div>
    </Card>
  );
}

function ActivityWidget({ className }: { className: string }) {
  const [scope, setScope] = useLocalStorageState<'mine' | 'all'>('ats-dashboard-activity', 'all');
  return (
    <Card className={className}>
      <CardHeader
        title="Recent activity"
        action={
          <SegmentedControl
            aria-label="Whose jobs"
            size="sm"
            value={scope}
            onValueChange={(value) => setScope(value as 'mine' | 'all')}
            items={[
              { value: 'mine', label: 'My jobs' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      <ActivityList scope={scope} take={8} />
    </Card>
  );
}

function JobsWidget({ data, className }: { data: DashboardData; className: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Open jobs"
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {stageTypes
              .filter((type) => !['Hired', 'Other'].includes(type.value))
              .map((type) => (
                <span key={type.value} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn('size-2 rounded-full', toneDot(stageTone(type.value)))}
                  />
                  {type.label}
                </span>
              ))}
          </span>
        }
        action={
          <CardLink href="/jobs">
            {data.jobs.length > 8 ? `All ${data.jobs.length} jobs` : 'All jobs'}
          </CardLink>
        }
      />
      {data.jobs.length === 0 ? (
        <EmptyState
          compact
          icon={Briefcase}
          title="No open jobs"
          description="Create a job to start getting applications."
          action={
            <Button asChild size="sm">
              <Link href="/jobs/new">Create a job</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {data.jobs.slice(0, 8).map((job) => {
            const active = job.stages.reduce((sum, stage) => sum + stage.count, 0);
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1fr)_160px_64px]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-fg">
                      {job.title}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {job.code}
                      {job.status === 'PendingApproval' && ' · waiting for approval'}
                      {' · '}
                      {job.hired} of {job.openings} hired
                    </span>
                  </span>
                  <PipelineBar stages={job.stages} className="col-span-2 sm:col-span-1" />
                  <span className="col-start-2 row-start-1 text-right sm:col-start-3">
                    <span className="block text-md font-semibold text-fg tnum">{active}</span>
                    <span className="block text-2xs text-fg-subtle">
                      active
                      {job.newToday > 0 && (
                        <Badge tone="blue" size="sm" className="ml-1">
                          {job.newToday} new
                        </Badge>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function InterviewList({
  items,
  empty,
}: {
  items: DashboardData['upcomingInterviews'];
  empty: ReactNode;
}) {
  if (items.length === 0) return <p className="px-5 pb-5 text-sm text-fg-subtle">{empty}</p>;
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {items.map((interview) => (
        <li key={interview.id}>
          <Link
            href={`/applications/${interview.applicationId}/interviews`}
            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted"
          >
            <span className="w-[72px] shrink-0 text-sm tnum">
              <span className="block text-fg">{time(interview.startsAt)}</span>
              <span className="block text-2xs text-fg-subtle">{dayLabel(interview.startsAt)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-fg">
                {interview.candidateName}
              </span>
              <span className="block truncate text-xs text-fg-subtle">
                {interview.title} · {interview.requisitionTitle}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WaitingCard({
  needs,
  limit,
  more = 0,
}: {
  needs: NotificationItem[];
  limit: number;
  more?: number;
}) {
  const hidden = needs.length - limit;
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Waiting on you"
        action={<CardLink href="/notifications">View all</CardLink>}
      />
      {needs.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-subtle">
          You’re all caught up. Approvals, feedback you owe, candidate replies and applications with
          no recent activity show up here.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {needs.slice(0, limit).map((need) => (
            <li key={need.key}>
              <Link
                href={need.href}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted"
              >
                <IconDisc icon={need.icon} tone={need.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{need.title}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{need.meta}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-accent-foreground">
                  {need.action}
                </span>
              </Link>
            </li>
          ))}
          {(hidden > 0 || more > 0) && (
            <li>
              <Link
                href="/notifications"
                className="block px-5 py-2.5 text-sm text-fg-subtle transition-colors hover:bg-muted hover:text-fg"
              >
                {hidden > 0
                  ? `${hidden} more waiting on you`
                  : `${more} more with no activity for a while`}
              </Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
