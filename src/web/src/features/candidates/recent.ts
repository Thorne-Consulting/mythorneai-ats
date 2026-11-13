/** Recently viewed candidates, kept in this browser (a convenience, not shared data). */
export type RecentCandidate = { id: string; name: string; title?: string | null; viewedAt: string };

export const RECENT_KEY = 'ats-recent-candidates';
const MAX = 20;

/** Newest first, one entry per person, at most 20. */
export function pushRecent(list: RecentCandidate[], entry: RecentCandidate): RecentCandidate[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX);
}

/** Called when a profile opens. Reads and writes localStorage directly; failures are ignored. */
export function rememberCandidate(entry: Omit<RecentCandidate, 'viewedAt'>) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentCandidate[];
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(pushRecent(list, { ...entry, viewedAt: new Date().toISOString() })),
    );
  } catch {}
}
