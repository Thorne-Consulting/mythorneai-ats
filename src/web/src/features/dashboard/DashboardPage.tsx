'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
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
  Button,
  Card,
  CardHeader,
  CardLink,
  CellStack,
  Drawer,
  EmptyState,
  IconButton,
  IconDisc,
  PageHeader,
  Progress,
  SkeletonRows,
  StatCard,
  StatGrid,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  Tooltip,
  type Tone,
} from '@/components/ui';
import { DonutChart } from '@/components/ui/chart';
import { StageBadge, stageTone } from '@/components/status';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import {
  buildNotifications,
  useDoneNotifications,
  type NotificationItem,
} from '@/features/notifications/notification-items';
import { formatRelative } from '@/lib/format';
import { useLocalStorageState } from '@/lib/hooks';
import { rowLinkProps } from '@/lib/row-link-props';
import type { DashboardData, RequisitionSummary } from '@/types';
import { InterviewerHome } from './InterviewerHome';
import {
  WIDGETS,
  defaultLayout,
  moveWidget,
  normalizeLayout,
  type WidgetId,
  type WidgetLayout,
} from './widget-layout';

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

export function DashboardPage({ initialData }: { initialData: DashboardData }) {
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
    initialData,
  });
  const firstName = user.displayName.split(' ')[0];

  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  if (user.role === 'Interviewer')
    return <InterviewerHome data={query.data} firstName={firstName} greeting={greeting()} />;
  return <TeamDashboard data={query.data} firstName={firstName} />;
}

function TeamDashboard({ data, firstName }: { data: DashboardData; firstName: string }) {
  const user = useCurrentUser();
  const [tab, setTab] = useLocalStorageState<'mine' | 'team'>(
    'ats-dashboard-tab',
    user.role === 'HiringManager' ? 'mine' : 'team',
  );
  const [stored, setStored] = useLocalStorageState<WidgetLayout>(
    `ats-dashboard-layout:${user.role}`,
    defaultLayout(user.role),
  );
  const layout = normalizeLayout(stored, user.role);
  const [customizing, setCustomizing] = useState(false);
  const approvals = usePendingApprovals();
  const [done] = useDoneNotifications();
  const needs = buildNotifications(data, approvals.data).filter((item) => !done.has(item.key));

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${firstName} 👋`}
        title="Welcome back to MyThorneAI ATS"
        description="Here’s what’s happening with your hiring today."
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
              <Button
                variant="secondary"
                leftIcon={<SlidersHorizontal />}
                onClick={() => setCustomizing(true)}
              >
                Customize
              </Button>
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
        <div className="grid grid-flow-row-dense grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
          {layout.order
            .filter((id) => !layout.hidden.includes(id))
            .map((id) => (
              <Widget key={id} id={id} data={data} needs={needs} />
            ))}
        </div>
      )}

      <Drawer
        opened={customizing}
        onClose={() => setCustomizing(false)}
        title="Customize dashboard"
        description="Choose which cards the Team view shows and in what order. Saved in this browser."
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
        <ol className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {layout.order.map((id, index) => (
            <li key={id} className="flex items-center gap-2 py-2 pr-2 pl-3">
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
            </li>
          ))}
        </ol>
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
        `/api/interviews?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
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
      <StatGrid>
        <StatCard
          href="/notifications"
          icon={Bell}
          tone={needs.length ? 'amber' : 'green'}
          label="Waiting on you"
          value={needs.length}
          hint={needs.length ? 'Oldest decisions first' : 'All caught up'}
        />
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
          hint="You own or recruit for"
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
                empty="You’re not on any interview panel in the next seven days."
              />
            )}
          </Card>
          <Card>
            <CardHeader title="My jobs" action={<CardLink href="/jobs">All jobs</CardLink>} />
            {jobs.isLoading ? (
              <SkeletonRows rows={3} />
            ) : myJobs.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-subtle">
                No open jobs list you as owner or recruiter.
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
}: {
  id: WidgetId;
  data: DashboardData;
  needs: NotificationItem[];
}) {
  const span = widgetSpan[id];
  switch (id) {
    case 'stats':
      return <StatsWidget data={data} className={span} />;
    case 'setup':
      return <SetupWidget className={span} />;
    case 'pipeline':
      return <PipelineWidget data={data} className={span} />;
    case 'sources':
      return <SourcesWidget className={span} />;
    case 'recent':
      return <RecentWidget data={data} className={span} />;
    case 'jobs':
      return <JobsWidget data={data} className={span} />;
    case 'upcoming':
      return (
        <Card className={span}>
          <CardHeader title="Coming up" action={<CardLink href="/interviews">View all</CardLink>} />
          <InterviewList
            items={data.upcomingInterviews}
            empty="No interviews in the next seven days."
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

function StatsWidget({ data, className }: { data: DashboardData; className: string }) {
  const hires = data.jobs.reduce((sum, job) => sum + job.hired, 0);
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
      />
      <StatCard
        href="/interviews"
        icon={CalendarDays}
        tone="green"
        label="Interviews scheduled"
        value={data.interviewsThisWeek}
        hint="Next 7 days"
      />
      <StatCard
        href="/reports/hires"
        icon={Trophy}
        tone="amber"
        label="Hires"
        value={hires}
        hint="On open jobs"
      />
    </StatGrid>
  );
}

function SetupWidget({ className }: { className: string }) {
  const user = useCurrentUser();
  const checklist = useQuery({
    queryKey: ['admin', 'setup-checklist'],
    queryFn: () => api.get<Step[]>('/api/admin/setup-checklist'),
    enabled: user.role === 'Admin',
    retry: false,
  });
  const steps = checklist.data ?? [];
  const pending = steps.filter((step) => !step.done);
  if (pending.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader
        title="Finish setting up"
        description={`${steps.length - pending.length} of ${steps.length} done`}
      />
      <div className="px-5 pb-2">
        <Progress
          value={steps.length - pending.length}
          max={steps.length}
          size="sm"
          label="Setup progress"
        />
      </div>
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
    </Card>
  );
}

function PipelineWidget({ data, className }: { data: DashboardData; className: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Hiring pipeline"
        action={<CardLink href="/pipeline">View pipeline</CardLink>}
      />
      <div className="px-5 pb-5">
        {data.pipeline.length === 0 ? (
          <p className="text-sm text-fg-subtle">No active applications yet.</p>
        ) : (
          <ol className="flex gap-1.5 overflow-x-auto pb-1">
            {data.pipeline.map((stage, index) => {
              const tone = stageTone(stage.stage);
              return (
                <li key={stage.stage} className="flex min-w-[118px] flex-1 items-center gap-1.5">
                  {index > 0 && (
                    <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                  )}
                  <div className="flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-border-subtle bg-muted px-3 py-4 text-center">
                    <IconDisc icon={stageIcons[tone]} tone={tone} size="md" />
                    <span className="w-full truncate text-sm font-medium text-fg">
                      {stage.stage}
                    </span>
                    <span className="text-2xl font-bold text-fg tnum">{stage.count}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

function SourcesWidget({ className }: { className: string }) {
  // Needs the reports permission; the card simply stays hidden without it.
  const sources = useQuery({
    queryKey: ['report', 'sources', 'dashboard'],
    queryFn: () => api.get<SourcesReport>('/api/reports/sources'),
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
        description="All applications"
        action={<CardLink href="/reports/sources">Report</CardLink>}
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

function RecentWidget({ data, className }: { data: DashboardData; className: string }) {
  const router = useRouter();
  return (
    <Card className={className}>
      <CardHeader
        title="Recent candidates"
        action={<CardLink href="/candidates">View all candidates</CardLink>}
      />
      {data.recentApplications.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="No candidates yet"
          description="Applications show up here as soon as people apply."
        />
      ) : (
        <div className="px-2 pb-2">
          <Table>
            <THead>
              <tr>
                <TH>Candidate</TH>
                <TH>Job</TH>
                <TH>Stage</TH>
                <TH align="right">Last activity</TH>
              </tr>
            </THead>
            <TBody>
              {data.recentApplications.map((item) => (
                <TR
                  key={item.id}
                  interactive
                  {...rowLinkProps(`Open ${item.candidateName}`, () =>
                    router.push(`/applications/${item.id}`),
                  )}
                >
                  <TD>
                    <CellStack primary={item.candidateName} secondary={item.candidateTitle} />
                  </TD>
                  <TD className="text-fg-muted">{item.requisitionTitle}</TD>
                  <TD>
                    <StageBadge stage={item.stage} />
                  </TD>
                  <TD align="right" className="whitespace-nowrap text-fg-subtle tnum">
                    {formatRelative(item.lastActivityAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function JobsWidget({ data, className }: { data: DashboardData; className: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Open jobs" action={<CardLink href="/jobs">All jobs</CardLink>} />
      {data.jobs.length === 0 ? (
        <EmptyState
          compact
          icon={Briefcase}
          title="No open jobs"
          description="Open one to start receiving applications."
          action={
            <Button asChild size="sm">
              <Link href="/jobs/new">Create a job</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {data.jobs.map((job) => {
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
                      {job.hired}/{job.openings} hired
                    </span>
                  </span>
                  <StageBar stages={job.stages} total={active} />
                  <span className="col-start-2 row-start-1 text-right sm:col-start-3">
                    <span className="block text-md font-semibold text-fg tnum">{active}</span>
                    <span className="block text-2xs text-fg-subtle">
                      {job.newToday > 0 ? `+${job.newToday} today` : 'active'}
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
          You’re clear. Approvals, feedback you owe, candidate replies and stalled applications show
          up here.
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
                  : `${more} more ${more === 1 ? 'has' : 'have'} been quiet a while`}
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
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** Where a job's active applicants sit, left to right through the pipeline. */
function StageBar({
  stages,
  total,
}: {
  stages: Array<{ name: string; count: number }>;
  total: number;
}) {
  const label = stages.map((stage) => `${stage.name} ${stage.count}`).join(', ');
  return (
    <span
      className="col-span-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-secondary sm:col-span-1"
      role="img"
      aria-label={`Pipeline: ${label}`}
    >
      {total > 0 &&
        stages.map((stage, index) =>
          stage.count === 0 ? null : (
            <Tooltip key={stage.name} label={`${stage.name}: ${stage.count}`}>
              <span
                className="h-full bg-primary"
                style={{
                  flexGrow: stage.count,
                  // One hue, deepening as people move further through the pipeline.
                  opacity: 0.35 + (0.65 * (index + 1)) / stages.length,
                }}
              />
            </Tooltip>
          ),
        )}
    </span>
  );
}
