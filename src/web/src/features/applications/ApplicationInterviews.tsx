'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Link2 } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  MenuItem,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { CancelInterviewDialog, OutcomeDialog } from '@/features/interviews/InterviewDialogs';
import { interviewHref, useInBrowser } from '@/features/interviews/interview-api';
import { scheduleHref } from '@/features/interviews/interview-links';
import { fromNow } from '@/features/interviews/interview-state';
import { LoadError, useApplication } from './application-data';
import { InterviewRound, type RoundAction } from './InterviewCard';

type SchedulingLink = {
  id: string;
  title: string;
  status: 'Open' | 'Booked' | 'Cancelled' | 'Expired';
  offeredStarts: string[];
  expiresAt: string;
  createdAt: string;
  reminderCount: number;
  url: string;
};

/**
 * The application's interview plan: every round that happened or is booked, then the job's rounds
 * that are not scheduled yet. Each round opens its own interview page.
 */
export function ApplicationInterviews({ id }: { id: string }) {
  const router = useRouter();
  const query = useApplication(id);
  const inBrowser = useInBrowser();
  const [action, setAction] = useState<{ id: string; kind: RoundAction } | null>(null);
  const schedule = (kit?: string) => router.push(scheduleHref({ application: id, kit }));
  // Older "Write scorecard" links (?scorecard=<interview>) now land on the interview's Feedback tab.
  const requested = useSearchParams().get('scorecard');
  useEffect(() => {
    if (requested) router.replace(interviewHref(requested, 'feedback'));
  }, [requested, router]);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  // Times are in the reader's zone, so the list draws in the browser.
  if (!query.data || !inBrowser)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const data = query.data;
  const application = data.application;
  const canManage = data.canManage;
  const rounds = [...application.interviews].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  // A round from the plan counts as booked once a live (not cancelled) interview uses its kit.
  const booked = new Set(
    rounds.filter((item) => item.status !== 'Cancelled').map((item) => item.interviewKitId),
  );
  const unbooked = canManage ? application.interviewKits.filter((kit) => !booked.has(kit.id)) : [];
  const target = rounds.find((item) => item.id === action?.id);

  if (rounds.length === 0 && unbooked.length === 0)
    return (
      <Card>
        {canManage && <OpenLinks applicationId={id} />}
        <EmptyState
          icon={CalendarPlus}
          title="No interviews yet"
          description={
            canManage
              ? 'Schedule the first one so interviewers can send their scorecards.'
              : 'Interviews show here once the recruiter books them.'
          }
          action={
            canManage && (
              <Button variant="soft" leftIcon={<CalendarPlus />} onClick={() => schedule()}>
                Schedule interview
              </Button>
            )
          }
        />
      </Card>
    );

  return (
    <Card>
      <CardHeader
        title="Interview rounds"
        description={
          unbooked.length > 0
            ? `${unbooked.length} ${unbooked.length === 1 ? 'round' : 'rounds'} from the job’s plan not scheduled yet`
            : undefined
        }
      />
      {canManage && <OpenLinks applicationId={id} />}
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {rounds.map((interview) => (
          <InterviewRound
            key={interview.id}
            interview={interview}
            people={data.people ?? {}}
            canManage={canManage}
            onAction={(kind) =>
              kind === 'reschedule'
                ? router.push(scheduleHref({ interview: interview.id }))
                : setAction({ id: interview.id, kind })
            }
          />
        ))}
        {unbooked.map((kit) => (
          <li key={kit.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-fg-muted">{kit.name}</p>
              <p className="mt-0.5 text-sm text-fg-subtle">
                {kit.durationMinutes} min · Not scheduled
              </p>
            </div>
            <Button
              size="sm"
              variant="soft"
              leftIcon={<CalendarPlus />}
              onClick={() => schedule(kit.id)}
            >
              Schedule
            </Button>
          </li>
        ))}
      </ul>

      {canManage && target && (
        <>
          <CancelInterviewDialog
            interviewId={target.id}
            applicationId={id}
            title={target.title}
            candidateName={application.candidateName}
            opened={action?.kind === 'cancel'}
            onClose={() => setAction(null)}
          />
          <OutcomeDialog
            interviewId={target.id}
            applicationId={id}
            candidateName={application.candidateName}
            initial={action?.kind === 'NoShow' ? 'NoShow' : 'Completed'}
            opened={action?.kind === 'Completed' || action?.kind === 'NoShow'}
            onClose={() => setAction(null)}
          />
        </>
      )}
    </Card>
  );
}

/** Scheduling links the candidate has not used yet: copy, remind or cancel each. */
function OpenLinks({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['scheduling-links', applicationId],
    queryFn: () =>
      api.get<SchedulingLink[]>(`/api/applications/${applicationId}/scheduling-requests`),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduling-links', applicationId] });
    queryClient.invalidateQueries({ queryKey: ['interview-attention'] });
  };
  const remind = useMutation({
    mutationFn: (id: string) => api.post(`/api/scheduling-requests/${id}/remind`),
    onSuccess: () => {
      refresh();
      toast.success('Reminder sent');
    },
    onError: (error: Error) => toast.error('Could not send the reminder', error.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/scheduling-requests/${id}/cancel`),
    onSuccess: () => {
      refresh();
      toast.success('Link cancelled');
    },
    onError: (error: Error) => toast.error('Could not cancel the link', error.message),
  });
  const open = (query.data ?? []).filter(
    (link) => link.status === 'Open' || link.status === 'Expired',
  );
  if (open.length === 0) return null;
  return (
    <ul className="divide-y divide-border-subtle border-b border-border-subtle bg-muted/50">
      {open.map((link) => {
        const url = link.url.startsWith('/') ? `${window.location.origin}${link.url}` : link.url;
        return (
          <li key={link.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <Link2 className="size-4 shrink-0 text-tone-amber-dot" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
                {link.title}
                <Badge tone={link.status === 'Open' ? 'amber' : 'gray'} dot size="sm">
                  {link.status === 'Open' ? 'Waiting for the candidate' : 'Link expired'}
                </Badge>
              </p>
              <p className="text-sm text-fg-subtle">
                Sent {fromNow(link.createdAt)}
                {link.offeredStarts.length > 0
                  ? ` · ${link.offeredStarts.length} times offered`
                  : ' · any open time'}
                {link.status === 'Open'
                  ? ` · works until ${new Date(link.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {link.status === 'Open' && <CopyButton value={url} label="Copy scheduling link" />}
              <RowActions label={`More for the ${link.title} link`}>
                {link.status === 'Open' && (
                  <MenuItem onSelect={() => remind.mutate(link.id)}>Email a reminder</MenuItem>
                )}
                {link.status === 'Open' && (
                  <MenuItem danger onSelect={() => cancel.mutate(link.id)}>
                    Cancel link
                  </MenuItem>
                )}
                {link.status === 'Expired' && (
                  <MenuItem
                    onSelect={() =>
                      window.location.assign(scheduleHref({ application: applicationId }))
                    }
                  >
                    Send a new link
                  </MenuItem>
                )}
              </RowActions>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
