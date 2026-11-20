import type { BoardData } from '@/types';

export type BoardStage = BoardData['stages'][number];
export type BoardCard = BoardStage['applications'][number];
export type ApplicantRow = BoardCard & {
  stageId: string;
  stageName: string;
  stageType?: string;
  stageColor?: string | null;
};

/** Every active applicant on a board, with the stage they sit in. */
export function flattenBoard(stages: BoardStage[]): ApplicantRow[] {
  return stages.flatMap((s) =>
    s.applications.map((a) => ({
      ...a,
      stageId: s.id,
      stageName: s.name,
      stageType: s.type,
      stageColor: s.color,
    })),
  );
}

/** Search used by the board and the list: name, current title or a skill. */
export function matchesApplicant(
  app: { candidateName: string; currentTitle?: string; skills: string[] },
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    app.candidateName.toLowerCase().includes(q) ||
    !!app.currentTitle?.toLowerCase().includes(q) ||
    app.skills.some((skill) => skill.toLowerCase().includes(q))
  );
}

const DAY = 86_400_000;

/** Whole days since a time; 0 on the first day. */
export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

/**
 * "4 days in stage", amber once past the stage's target and red past twice the target.
 */
export function timeInStage(
  enteredAt: string | undefined,
  targetDays: number | null | undefined,
  now = Date.now(),
) {
  if (!enteredAt) return null;
  const days = daysSince(enteredAt, now);
  const text =
    days === 0 ? 'In stage since today' : `${days} ${days === 1 ? 'day' : 'days'} in stage`;
  const tone: 'amber' | 'red' | null = !targetDays
    ? null
    : days > 2 * targetDays
      ? 'red'
      : days > targetDays
        ? 'amber'
        : null;
  return { days, text, tone };
}

/** Average whole days in stage for a column's header, or null when it is empty. */
export function averageDaysInStage(cards: BoardCard[], now = Date.now()) {
  if (cards.length === 0) return null;
  const total = cards.reduce(
    (sum, card) => sum + daysSince(card.enteredStageAt ?? card.appliedAt, now),
    0,
  );
  return Math.round(total / cards.length);
}

export type CardSort = 'activity' | 'days' | 'score' | 'applied' | 'fit' | 'years';
export const cardSorts: { value: CardSort; label: string }[] = [
  { value: 'activity', label: 'Latest activity' },
  { value: 'days', label: 'Longest in stage' },
  { value: 'score', label: 'Highest rating' },
  { value: 'applied', label: 'Applied first' },
  { value: 'fit', label: 'Best AI fit' },
  { value: 'years', label: 'Most experience' },
];

/** Cards in a column, in the chosen order. Ties keep the server's order (latest activity). */
export function sortCards<T extends BoardCard>(cards: T[], sort: CardSort): T[] {
  if (sort === 'activity') return cards;
  // People with no value (no rating, no fit check, no years read) go last.
  const key = (card: T) =>
    sort === 'days'
      ? Date.parse(card.enteredStageAt ?? card.appliedAt)
      : sort === 'score'
        ? -(card.rating ?? 0)
        : sort === 'fit'
          ? -(card.fitScore ?? -1)
          : sort === 'years'
            ? -(card.yearsExperience ?? -1)
            : Date.parse(card.appliedAt);
  return [...cards].sort((a, b) => key(a) - key(b));
}

/** What narrows a job's board or list, besides the search box and the stage chips. */
export type PipelineFilters = {
  sources: string[];
  minRating: number | null;
  minYears: number | null;
  minFit: number | null;
  skills: string[];
  tags: string[];
  /** Applied within this many days. */
  appliedWithin: number | null;
  /** No movement for this many days or more. */
  idleDays: number | null;
  flagged: boolean;
  feedbackOwed: boolean;
  hasInterview: boolean;
  /** passed, failed, waiting (sent, not scored or decided), none */
  assessment: 'passed' | 'failed' | 'waiting' | 'none' | null;
};

export const NO_FILTERS: PipelineFilters = {
  sources: [],
  minRating: null,
  minYears: null,
  minFit: null,
  skills: [],
  tags: [],
  appliedWithin: null,
  idleDays: null,
  flagged: false,
  feedbackOwed: false,
  hasInterview: false,
  assessment: null,
};

/** How many of the filters are set, for the badge on the button. */
export function activeFilterCount(f: PipelineFilters) {
  return [
    f.sources.length > 0,
    f.minRating !== null,
    f.minYears !== null,
    f.minFit !== null,
    f.skills.length > 0,
    f.tags.length > 0,
    f.appliedWithin !== null,
    f.idleDays !== null,
    f.flagged,
    f.feedbackOwed,
    f.hasInterview,
    f.assessment !== null,
  ].filter(Boolean).length;
}

/** Does a card pass every filter that is set? Skills and tags match any of the ones chosen. */
export function matchesFilters(card: BoardCard, f: PipelineFilters, now = Date.now()) {
  if (f.sources.length && !f.sources.includes(card.source)) return false;
  if (f.minRating !== null && (card.rating ?? 0) < f.minRating) return false;
  if (f.minYears !== null && (card.yearsExperience ?? -1) < f.minYears) return false;
  if (f.minFit !== null && (card.fitScore ?? -1) < f.minFit) return false;
  const has = (list: string[] | undefined, wanted: string[]) =>
    wanted.some((item) => (list ?? []).some((value) => value.toLowerCase() === item.toLowerCase()));
  if (f.skills.length && !has(card.skills, f.skills)) return false;
  if (f.tags.length && !has(card.tags, f.tags)) return false;
  if (f.appliedWithin !== null && daysSince(card.appliedAt, now) > f.appliedWithin) return false;
  if (f.idleDays !== null && daysSince(card.lastActivityAt, now) < f.idleDays) return false;
  if (f.flagged && !card.flagged) return false;
  if (f.feedbackOwed && !(card.feedbackOwed && card.feedbackOwed > 0)) return false;
  if (f.hasInterview && !card.nextInterviewAt) return false;
  if (f.assessment) {
    const a = card.assessment;
    const state = !a
      ? 'none'
      : a.decision === 'Passed'
        ? 'passed'
        : a.decision === 'Failed'
          ? 'failed'
          : 'waiting';
    if (state !== f.assessment) return false;
  }
  return true;
}
