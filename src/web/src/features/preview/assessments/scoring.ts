// Pure assessment logic: question shapes, auto-grading, submission totals and builder validation.
// No React and no runtime imports, so scoring.check.mjs can run it with plain node.

export type QuestionType = 'single' | 'multi' | 'short' | 'long' | 'code' | 'file';

export type ChoiceOption = { id: string; text: string; correct: boolean };

/** Every field is always present so the builder never juggles undefined; unused ones stay empty. */
export type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: ChoiceOption[];
  /** What a full-marks answer looks like (manually scored types). */
  rubric: string;
  language: string;
  starterCode: string;
  /** File types the candidate may upload, e.g. ".pdf,.png". */
  accept: string;
};

export type Answer = { choice: string[]; text: string; file: string };

export const questionTypeLabels: Record<QuestionType, string> = {
  single: 'Multiple choice (one answer)',
  multi: 'Multiple choice (several answers)',
  short: 'Short text',
  long: 'Long text',
  code: 'Code',
  file: 'File upload',
};

export const isAutoScored = (q: Pick<Question, 'type'>) =>
  q.type === 'single' || q.type === 'multi';

/** Points for a choice question: all-or-nothing on the exact set of correct options. */
export function autoPoints(q: Question, a: Answer | undefined): number {
  if (!isAutoScored(q) || !a) return 0;
  const correct = q.options.filter((o) => o.correct).map((o) => o.id);
  const picked = new Set(a.choice);
  const exact = picked.size === correct.length && correct.every((id) => picked.has(id));
  return exact ? q.points : 0;
}

export type SubmissionScore = {
  earned: number;
  total: number;
  /** Manually scored questions without a reviewer score yet. */
  pending: number;
  /** 0–100, null while anything is pending. */
  percent: number | null;
};

export function scoreSubmission(
  questions: Question[],
  answers: Record<string, Answer>,
  reviews: Record<string, number>,
): SubmissionScore {
  let earned = 0;
  let total = 0;
  let pending = 0;
  for (const q of questions) {
    total += q.points;
    if (isAutoScored(q)) earned += autoPoints(q, answers[q.id]);
    else if (reviews[q.id] === undefined) pending++;
    else earned += Math.min(q.points, Math.max(0, reviews[q.id]));
  }
  const percent = pending || !total ? null : Math.round((earned / total) * 100);
  return { earned, total, pending, percent };
}

/** What stops a question from being published. Empty means it is fine. */
export function questionProblems(q: Question): string[] {
  const out: string[] = [];
  if (!q.prompt.trim()) out.push('Write the question');
  if (!(q.points >= 1)) out.push('Give it at least 1 point');
  if (isAutoScored(q)) {
    const filled = q.options.filter((o) => o.text.trim());
    const correct = q.options.filter((o) => o.correct).length;
    if (filled.length < 2 || filled.length !== q.options.length)
      out.push('Fill in at least two answers and remove empty ones');
    if (q.type === 'single' && correct !== 1) out.push('Mark exactly one correct answer');
    if (q.type === 'multi' && correct < 1) out.push('Mark at least one correct answer');
  }
  if (q.type === 'code' && !q.language) out.push('Pick a language');
  return out;
}

/** Stable 32-bit FNV-1a hash, for deterministic sample data. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Score buckets for the distribution chart. */
export function scoreBuckets(percents: number[]) {
  const labels = ['0–49', '50–59', '60–69', '70–79', '80–89', '90–100'];
  const counts = labels.map(() => 0);
  for (const p of percents) counts[p < 50 ? 0 : Math.min(5, Math.floor(p / 10) - 4)]++;
  return labels.map((range, i) => ({ range, candidates: counts[i] }));
}
