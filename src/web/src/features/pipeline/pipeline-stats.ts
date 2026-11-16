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

export type CardSort = 'activity' | 'days' | 'score' | 'applied';
export const cardSorts: { value: CardSort; label: string }[] = [
  { value: 'activity', label: 'Latest activity' },
  { value: 'days', label: 'Longest in stage' },
  { value: 'score', label: 'Highest rating' },
  { value: 'applied', label: 'Applied first' },
];

/** Cards in a column, in the chosen order. Ties keep the server's order (latest activity). */
export function sortCards<T extends BoardCard>(cards: T[], sort: CardSort): T[] {
  if (sort === 'activity') return cards;
  const key = (card: T) =>
    sort === 'days'
      ? Date.parse(card.enteredStageAt ?? card.appliedAt)
      : sort === 'score'
        ? -(card.rating ?? 0)
        : Date.parse(card.appliedAt);
  return [...cards].sort((a, b) => key(a) - key(b));
}
