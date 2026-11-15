'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Avatar, Badge, Button, RowActions, MenuItem, Tooltip } from '@/components/ui';
import { interviewHref } from '@/features/interviews/interview-api';
import { interviewState, rangeText, whenPhrase } from '@/features/interviews/interview-state';
import type { Interview } from './application-types';

export type RoundAction = 'reschedule' | 'cancel' | 'Completed' | 'NoShow';

/**
 * One round on the application's Interviews tab: name, when, the panel with scorecard ticks, a
 * status that knows the time, and the way into the interview page.
 */
export function InterviewRound({
  interview,
  people,
  canManage,
  onAction,
}: {
  interview: Interview;
  people: Record<string, string>;
  canManage: boolean;
  onAction: (action: RoundAction) => void;
}) {
  const router = useRouter();
  const state = interviewState(interview.status, interview.startsAt, interview.endsAt);
  const phrase = whenPhrase(state, interview.startsAt, interview.endsAt);
  const submitted = new Set(interview.scorecards.map((card) => card.interviewerEmail));
  const nameOf = (email: string) => people[email] ?? email.split('@')[0];
  const started = !['upcoming', 'waiting', 'cancelled'].includes(state.key);
  const href = interviewHref(interview.id);
  return (
    // Fixed columns on wider screens so avatars, counts and buttons line up from row to row.
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_7rem_6.5rem]">
      <div className="min-w-0 flex-[1_1_260px]">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className={
              state.key === 'cancelled'
                ? 'text-base font-semibold text-fg-muted line-through hover:underline'
                : 'text-base font-semibold text-fg hover:underline'
            }
          >
            {interview.title}
          </Link>
          <Badge tone={state.tone} dot size="sm">
            {state.label}
          </Badge>
          {interview.calendarStatus === 'Failed' && canManage && state.key === 'upcoming' && (
            <Badge tone="red" size="sm">
              Invite failed
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">
          {rangeText(interview.startsAt, interview.endsAt)}
          {phrase && <span className="text-fg-subtle"> · {phrase}</span>}
        </p>
      </div>
      <ul className="flex items-center -space-x-1.5" aria-label="Interviewers">
        {interview.interviewerEmails.map((email) => {
          const done = submitted.has(email);
          return (
            <li key={email} className="relative">
              <Tooltip
                label={`${nameOf(email)}${done ? ': scorecard in' : started ? ': scorecard due' : ''}`}
              >
                <span
                  tabIndex={0}
                  className="block rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Avatar name={nameOf(email)} size="sm" className="ring-2 ring-card" />
                </span>
              </Tooltip>
              {done && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-tone-green-dot text-white ring-2 ring-card"
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <span className="text-xs text-fg-subtle tnum">
        {started && state.key !== 'noshow'
          ? `${interview.submittedScorecards} of ${interview.interviewerEmails.length} scorecards`
          : ''}
      </span>
      <div className="ml-auto flex items-center justify-end gap-1">
        <Button asChild size="sm" variant="secondary">
          <Link href={href}>Open</Link>
        </Button>
        {canManage && state.key !== 'cancelled' && (
          <RowActions label={`More for ${interview.title}`}>
            <MenuItem onSelect={() => router.push(href)}>Open interview</MenuItem>
            <MenuItem onSelect={() => onAction('reschedule')}>
              {state.key === 'upcoming' || state.key === 'waiting'
                ? 'Reschedule or edit'
                : 'Edit details'}
            </MenuItem>
            {started && <MenuItem onSelect={() => onAction('Completed')}>Mark completed</MenuItem>}
            {started && <MenuItem onSelect={() => onAction('NoShow')}>Mark as no-show</MenuItem>}
            {!started && (
              <MenuItem danger onSelect={() => onAction('cancel')}>
                Cancel interview
              </MenuItem>
            )}
          </RowActions>
        )}
      </div>
    </li>
  );
}
