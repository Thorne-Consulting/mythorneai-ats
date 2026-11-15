// Pure helpers for how an interview reads at a given moment. No React here, so the check file can
// run it with `node --experimental-strip-types`.

export type InterviewStateKey =
  'waiting' | 'upcoming' | 'live' | 'ended' | 'completed' | 'noshow' | 'cancelled';

export type StateTone = 'blue' | 'violet' | 'green' | 'amber' | 'red' | 'gray';

export type InterviewState = {
  key: InterviewStateKey;
  label: string;
  tone: StateTone;
  /** How the calendar draws it. */
  look: 'solid' | 'dashed' | 'muted' | 'struck';
};

const STATES: Record<InterviewStateKey, InterviewState> = {
  waiting: { key: 'waiting', label: 'Waiting for candidate', tone: 'amber', look: 'dashed' },
  upcoming: { key: 'upcoming', label: 'Upcoming', tone: 'blue', look: 'solid' },
  live: { key: 'live', label: 'Live now', tone: 'green', look: 'solid' },
  ended: { key: 'ended', label: 'Ended', tone: 'amber', look: 'muted' },
  completed: { key: 'completed', label: 'Completed', tone: 'green', look: 'muted' },
  noshow: { key: 'noshow', label: 'No-show', tone: 'red', look: 'solid' },
  cancelled: { key: 'cancelled', label: 'Cancelled', tone: 'gray', look: 'struck' },
};

/**
 * The status the server stores, read against the clock: a booked interview is Upcoming, then Live
 * now, then Ended until someone says how it went (or the sweep marks it Completed a day later).
 */
export function interviewState(
  status: string,
  startsAt: string | Date,
  endsAt: string | Date,
  now: Date = new Date(),
): InterviewState {
  if (status === 'Cancelled') return STATES.cancelled;
  if (status === 'NoShow') return STATES.noshow;
  if (status === 'Completed') return STATES.completed;
  if (status === 'Proposed') return STATES.waiting;
  const t = now.getTime();
  if (t < new Date(startsAt).getTime()) return STATES.upcoming;
  if (t < new Date(endsAt).getTime()) return STATES.live;
  return STATES.ended;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "in 25 minutes", "in 2 hours", "tomorrow", "3 hours ago". */
export function fromNow(at: string | Date, now: Date = new Date()) {
  const minutes = Math.round((new Date(at).getTime() - now.getTime()) / 60_000);
  const size = Math.abs(minutes);
  if (size < 1) return 'now';
  if (size < 60) return relative.format(minutes, 'minute');
  if (size < 60 * 24) return relative.format(Math.round(minutes / 60), 'hour');
  return relative.format(Math.round(minutes / (60 * 24)), 'day');
}

/** What to say beside the state badge: "in 2 hours", "ends in 20 minutes", "3 hours ago". */
export function whenPhrase(
  state: InterviewState,
  startsAt: string,
  endsAt: string,
  now = new Date(),
) {
  if (state.key === 'upcoming' || state.key === 'waiting') return fromNow(startsAt, now);
  if (state.key === 'live') return `ends ${fromNow(endsAt, now)}`;
  if (state.key === 'cancelled') return null;
  return fromNow(endsAt, now);
}

/** "Central Standard Time" for a zone at a moment, from the browser's own data. */
export function zoneName(timeZone: string | undefined, at: Date = new Date()) {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ??
      timeZone ??
      'UTC'
    );
  } catch {
    return timeZone ?? 'UTC';
  }
}

/** "Friday, November 20, 3:00 – 4:00 PM" in the given zone (the browser's when none is given). */
export function rangeText(startsAt: string, endsAt: string, timeZone?: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${time.formatRange(start, end)}`
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
}

/** The browser's zone, for example "America/Chicago". */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
