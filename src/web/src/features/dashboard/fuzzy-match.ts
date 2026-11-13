// Command palette matching. Lives here because the palette's own folder is shared; move to lib/
// if anything else needs it.

/**
 * How well `query` matches `text`: -1 when it doesn't, higher is better. A plain substring wins
 * (earlier and at the start is better); otherwise every query letter must appear in order, with
 * runs of adjacent letters and word starts ("cj" → "Create job") scoring more.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at + (at === 0 ? 500 : 0);
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const letter of q) {
    if (letter === ' ') continue;
    const found = t.indexOf(letter, from);
    if (found < 0) return -1;
    score += found === previous + 1 ? 3 : found === 0 || t[found - 1] === ' ' ? 2 : 0;
    previous = found;
    from = found + 1;
  }
  return score;
}
