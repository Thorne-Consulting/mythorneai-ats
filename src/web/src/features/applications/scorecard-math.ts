// Plain TS (no path aliases) so the check can run under node --experimental-strip-types.

type Rated = { criterionId: string; rating: number };
type Weighted = { id: string; weight: number };

/**
 * One scorecard as a single 1–5 number: the criterion ratings weighted by the kit. Without
 * criteria (or weights) it is the interviewer's overall rating.
 */
export function weightedScore(
  card: { rating: number; criteria: Rated[] },
  criteria: Weighted[],
): number {
  let sum = 0;
  let weight = 0;
  for (const criterion of criteria) {
    const rated = card.criteria.find((item) => item.criterionId === criterion.id);
    if (!rated || criterion.weight <= 0) continue;
    sum += rated.rating * criterion.weight;
    weight += criterion.weight;
  }
  return weight ? sum / weight : card.rating;
}

/** Mean rating for one criterion across the panel, or null when nobody rated it. */
export function criterionAverage(cards: { criteria: Rated[] }[], criterionId: string) {
  const ratings = cards.flatMap((card) =>
    card.criteria.filter((item) => item.criterionId === criterionId).map((item) => item.rating),
  );
  return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
}

export const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/** The four calls an interviewer can make, weakest first. "Mixed" is gone: it hid the lean. */
export const RECOMMENDATIONS = [
  { value: 'StrongNo', label: 'Strong no' },
  { value: 'No', label: 'No' },
  { value: 'Yes', label: 'Yes' },
  { value: 'StrongYes', label: 'Strong yes' },
] as const;

/** Words under the stars, so a 2 means the same to everyone. */
export const SCALE = ['', 'Well below', 'Below', 'Meets', 'Above', 'Well above'];

/** "2 Strong yes · 1 Yes", strongest first, skipping calls nobody made. */
export function tallyText(recommendations: string[]): string {
  const calls: { value: string; label: string }[] = [...RECOMMENDATIONS].reverse();
  return [...calls, { value: 'Mixed', label: 'Mixed' }]
    .map((item) => [recommendations.filter((r) => r === item.value).length, item.label] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(' · ');
}

/** Tone for a 1–5 score: 1–2 red, 3 amber, 4–5 green (averages round to the nearest band). */
export function scoreTone(value: number): 'red' | 'amber' | 'green' {
  if (value < 2.5) return 'red';
  if (value < 3.5) return 'amber';
  return 'green';
}

/** Whole days since a moment, never negative. */
export function daysSince(value: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 86_400_000));
}

type GridInterview = {
  id: string;
  criteria: { id: string; name: string }[];
  scorecards: { criteria: Rated[] }[];
};

/**
 * Competencies down, interviews across: each cell is that interview's average for the
 * competency. Competencies match by name, because each interview has its own kit.
 */
export function competencyGrid(interviews: GridInterview[]) {
  const names = [...new Set(interviews.flatMap((i) => i.criteria.map((c) => c.name)))];
  return names.map((name) => {
    const cells = interviews.map((interview) => {
      const criterion = interview.criteria.find((c) => c.name === name);
      return criterion ? criterionAverage(interview.scorecards, criterion.id) : null;
    });
    const rated = cells.filter((v): v is number => v !== null);
    return {
      name,
      cells,
      average: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    };
  });
}
