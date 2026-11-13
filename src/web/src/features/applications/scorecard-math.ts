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
