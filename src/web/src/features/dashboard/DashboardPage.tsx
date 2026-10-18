'use client';

import { Anchor, Box, Button, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconChecklist,
  IconChevronRight,
  IconClockPause,
  IconMessageCircle,
  IconPencil,
  type Icon,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import { formatRelative } from '@/lib/format';
import type { DashboardData } from '@/types';
import { InterviewerHome } from './InterviewerHome';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Step = { key: string; title: string; detail: string; done: boolean; href: string };

type Need = {
  key: string;
  icon: Icon;
  title: string;
  meta: string;
  href: string;
  action: string;
};

export function DashboardPage({ initialData }: { initialData: DashboardData }) {
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
    initialData,
  });
  const approvals = usePendingApprovals();
  const checklist = useQuery({
    queryKey: ['admin', 'setup-checklist'],
    queryFn: () => api.get<Step[]>('/api/admin/setup-checklist'),
    enabled: user.role === 'Admin',
    retry: false,
  });
  const firstName = user.displayName.split(' ')[0];

  if (!query.data) return <LoadingBlock rows={6} />;
  const data = query.data;
  if (user.role === 'Interviewer')
    return <InterviewerHome data={data} firstName={firstName} greeting={greeting()} />;

  // Ordered by what blocks someone else first: a decision, then feedback, then a person waiting
  // on a reply, then work that has gone quiet.
  const quietDays = (item: DashboardData['stalled'][number]) =>
    formatRelative(item.lastActivityAt).replace(' ago', '');
  const needs: Need[] = [
    ...(approvals.data ?? []).map((item) => ({
      key: `a-${item.id}`,
      icon: IconChecklist,
      title: item.title,
      meta: `${item.detail} · asked by ${item.requestedByName}`,
      href: '/approvals',
      action: 'Decide',
    })),
    ...data.scorecardsDue.map((item) => ({
      key: `s-${item.id}`,
      icon: IconPencil,
      title: `Scorecard for ${item.candidateName}`,
      meta: `${item.title} · ended ${formatRelative(item.endsAt)}`,
      href: `/applications/${item.applicationId}/interviews?scorecard=${item.id}`,
      action: 'Write',
    })),
    ...data.unreadMessages.map((item) => ({
      key: `m-${item.applicationId}`,
      icon: IconMessageCircle,
      title: `${item.candidateName} wrote`,
      meta: `“${item.preview.slice(0, 80)}${item.preview.length > 80 ? '…' : ''}” · ${formatRelative(item.at)}`,
      href: `/applications/${item.applicationId}`,
      action: 'Reply',
    })),
    ...data.stalled.slice(0, 4).map((item) => ({
      key: `q-${item.applicationId}`,
      icon: IconClockPause,
      title: `${item.candidateName}, stuck in ${item.stage}`,
      meta: `${item.requisitionTitle} · nothing has happened for ${quietDays(item)}`,
      href: `/applications/${item.applicationId}`,
      action: 'Open',
    })),
  ];
  const moreStalled = data.stalledTotal - Math.min(data.stalled.length, 4);

  const steps = checklist.data ?? [];
  const pendingSteps = steps.filter((step) => !step.done);

  return (
    <>
      <header className="home-header">
        <h1 className="home-title">
          {greeting()}, {firstName}
        </h1>
      </header>

      <div className="home-grid">
        <Stack gap={40} style={{ minWidth: 0 }}>
          {pendingSteps.length > 0 && (
            <section className="setup-side" aria-label="Finish setting up">
              <details>
                <summary>
                  <span className="setup-meter" aria-hidden>
                    <span
                      style={{
                        width: `${((steps.length - pendingSteps.length) / steps.length) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="setup-label">
                    Setup · {steps.length - pendingSteps.length} of {steps.length}
                  </span>
                  <IconChevronRight size={14} className="setup-chevron" aria-hidden />
                </summary>
                <ul className="setup-list">
                  {pendingSteps.map((step) => (
                    <li key={step.key}>
                      <Link href={step.href}>
                        <span className="setup-step">
                          {step.title}
                          <span className="setup-detail">{step.detail}</span>
                        </span>
                        <span className="setup-go">Set up</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}

          <section className="panel" aria-labelledby="needs-title">
            <div className="panel-head">
              <h2 id="needs-title" className="panel-title">
                Waiting on you
              </h2>
            </div>
            {needs.length === 0 ? (
              <Text size="sm" c="dimmed" px={24} pb="lg">
                You're clear. Approvals, feedback you owe, candidate replies and stalled
                applications show up here.
              </Text>
            ) : (
              <ul className="rows">
                {needs.map((need) => (
                  <li key={need.key}>
                    <Link href={need.href} className="row">
                      <need.icon size={17} stroke={1.7} className="row-icon" aria-hidden />
                      <span className="row-main">
                        <span className="row-title">{need.title}</span>
                        <span className="row-meta">{need.meta}</span>
                      </span>
                      <span className="row-action">{need.action}</span>
                    </Link>
                  </li>
                ))}
                {moreStalled > 0 && (
                  <li>
                    <Link href="/candidates" className="row row-more">
                      {moreStalled} more {moreStalled === 1 ? 'has' : 'have'} been quiet a while
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="jobs-title">
            <div className="panel-head">
              <h2 id="jobs-title" className="panel-title">
                Open jobs
              </h2>
              <Anchor component={Link} href="/requisitions" size="sm">
                All jobs
              </Anchor>
            </div>
            {data.jobs.length === 0 ? (
              <Box px={24} pb="lg">
                <Text size="sm" c="dimmed" mb="sm">
                  No open jobs. Open one to start receiving applications.
                </Text>
                <Button component={Link} href="/requisitions/new" size="xs">
                  Create a job
                </Button>
              </Box>
            ) : (
              <ul className="rows">
                {data.jobs.map((job) => {
                  const active = job.stages.reduce((sum, stage) => sum + stage.count, 0);
                  return (
                    <li key={job.id}>
                      <Link href={`/requisitions/${job.id}`} className="row job-row">
                        <span className="row-main">
                          <span className="row-title">{job.title}</span>
                          <span className="row-meta">
                            {job.code}
                            {job.status === 'PendingApproval' && ' · waiting for approval'}
                            {' · '}
                            {job.hired}/{job.openings} hired
                          </span>
                        </span>
                        <StageBar stages={job.stages} total={active} />
                        <span className="job-figures tnum">
                          <span className="job-active">{active}</span>
                          <span className="row-meta">
                            {job.newToday > 0 ? `+${job.newToday} today` : 'active'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </Stack>

        <Stack gap={40} style={{ minWidth: 0 }}>
          <section className="panel" aria-labelledby="schedule-title">
            <div className="panel-head">
              <h2 id="schedule-title" className="panel-title">
                Coming up
              </h2>
              <Anchor component={Link} href="/interviews" size="sm">
                Calendar
              </Anchor>
            </div>
            {data.upcomingInterviews.length === 0 ? (
              <Text size="sm" c="dimmed" px={24} pb="lg">
                No interviews in the next seven days.
              </Text>
            ) : (
              <ul className="rows">
                {data.upcomingInterviews.map((interview) => (
                  <li key={interview.id}>
                    <Link
                      href={`/applications/${interview.applicationId}/interviews`}
                      className="row"
                    >
                      <span className="when tnum">
                        <span className="when-day">{dayLabel(interview.startsAt)}</span>
                        <span className="when-time">
                          {new Date(interview.startsAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      <span className="row-main">
                        <span className="row-title">{interview.candidateName}</span>
                        <span className="row-meta">
                          {interview.title} · {interview.requisitionTitle}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="recent-title">
            <div className="panel-head">
              <h2 id="recent-title" className="panel-title">
                Recently moved
              </h2>
            </div>
            <ul className="rows">
              {data.recentApplications.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/applications/${item.id}`} className="row">
                    <span className="row-main">
                      <span className="row-title">{item.candidateName}</span>
                      <span className="row-meta">
                        {item.stage} · {item.requisitionTitle}
                      </span>
                    </span>
                    <span className="row-meta tnum">{formatRelative(item.lastActivityAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </Stack>
      </div>
    </>
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
    <span className="stage-bar" role="img" aria-label={`Pipeline: ${label}`}>
      {total === 0 ? (
        <span className="stage-bar-empty" />
      ) : (
        stages.map((stage, index) =>
          stage.count === 0 ? null : (
            <Tooltip key={stage.name} label={`${stage.name}: ${stage.count}`} openDelay={150}>
              <span
                className="stage-bar-seg"
                style={{
                  flexGrow: stage.count,
                  // One hue, deepening as people move further through the pipeline.
                  opacity: 0.35 + (0.65 * (index + 1)) / stages.length,
                }}
              />
            </Tooltip>
          ),
        )
      )}
    </span>
  );
}
