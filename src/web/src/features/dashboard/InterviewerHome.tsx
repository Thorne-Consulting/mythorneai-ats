'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, PencilLine } from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CountBadge,
  EmptyState,
  IconDisc,
  PageHeader,
  StatCard,
  StatGrid,
} from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { DashboardData } from '@/types';

const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What an occasional interviewer needs on arrival: the next interview, and feedback they owe. */
export function InterviewerHome({
  data,
  firstName,
  greeting,
}: {
  data: DashboardData;
  firstName: string;
  greeting: string;
}) {
  const [next, ...later] = data.upcomingInterviews;
  return (
    <>
      <PageHeader
        eyebrow={`${greeting}, ${firstName} 👋`}
        title="Your interviews"
        description="Prepare for what’s next and send feedback while it’s fresh."
      />
      <div className="flex flex-col gap-4">
        <StatGrid className="xl:grid-cols-2">
          <StatCard
            href="/interviews"
            icon={CalendarDays}
            tone="blue"
            label="Interviews in the next 7 days"
            value={data.interviewsThisWeek}
          />
          <StatCard
            icon={PencilLine}
            tone={data.scorecardsDue.length > 0 ? 'amber' : 'green'}
            label="Feedback to submit"
            value={data.scorecardsDue.length}
            hint={data.scorecardsDue.length > 0 ? 'Oldest first below' : 'All caught up'}
          />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader title="Your next interview" />
              {next ? (
                <div className="flex flex-wrap items-center gap-4 px-5 pb-5">
                  <IconDisc icon={CalendarDays} tone="blue" />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-fg">{next.candidateName}</p>
                    <p className="text-sm text-fg-muted">
                      {next.title} · {next.requisitionTitle}
                    </p>
                    <p className="mt-1 text-sm text-accent-foreground tnum">
                      {formatDateTime(next.startsAt)}
                    </p>
                  </div>
                  <Button asChild>
                    <Link
                      href={`/applications/${next.applicationId}/interviews`}
                      aria-label={`Prepare for ${next.candidateName}, ${next.title}`}
                    >
                      Prepare
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="Nothing scheduled this week"
                  description="When someone books you, it appears here with a link to prepare."
                />
              )}
            </Card>

            <ScorecardsDueCard items={data.scorecardsDue} />
          </div>

          <Card className="self-start">
            <CardHeader title="Later" />
            {later.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-fg-subtle">Nothing else booked yet.</p>
            ) : (
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {later.map((interview) => (
                  <li key={interview.id}>
                    <Link
                      href={`/applications/${interview.applicationId}/interviews`}
                      aria-label={`Prepare for ${interview.candidateName}, ${interview.title}`}
                      className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="flex w-11 shrink-0 flex-col items-center rounded-md bg-accent py-1 text-accent-foreground">
                        <span className="text-2xs">
                          {new Date(interview.startsAt).toLocaleDateString(undefined, {
                            month: 'short',
                          })}
                        </span>
                        <span className="text-md leading-none font-bold tnum">
                          {new Date(interview.startsAt).getDate()}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {interview.candidateName}
                        </span>
                        <span className="block truncate text-2xs text-fg-subtle">
                          {time(interview.startsAt)} · {interview.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Feedback this person owes. The longest overdue comes first. */
function ScorecardsDueCard({ items }: { items: DashboardData['scorecardsDue'] }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Feedback to submit
            {items.length > 0 && <CountBadge count={items.length} tone="amber" />}
          </span>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={CheckCircle2}
          title="You’re all caught up"
          description="After an interview, the feedback you owe shows up here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3">
              <IconDisc icon={PencilLine} tone="amber" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-fg">
                  {item.candidateName} · {item.title}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {item.requisitionTitle} · ended {formatRelative(item.endsAt)}
                </span>
              </span>
              <Button asChild size="sm" variant="soft">
                <Link
                  href={`/applications/${item.applicationId}/interviews?scorecard=${item.id}`}
                  aria-label={`Write scorecard for ${item.candidateName}, ${item.title}`}
                >
                  Write scorecard
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
