// Pure assessment logic: question shapes, the builder's checks, plurals, integrity summaries and
// small helpers. No React and no runtime imports, so scoring.check.mjs runs it with plain node.
// The server scores (AssessmentScoring.cs); autoPoints here mirrors it for previews and stays the
// shared spec in scoring.check.mjs.

export type QuestionType = 'single' | 'multi' | 'short' | 'long' | 'code' | 'file';

export type ChoiceOption = { id: string; text: string; correct: boolean };

/** Every field is always present so the builder never juggles undefined; unused ones stay empty. */
export type Question = {
  id: string;
  type: QuestionType;
  /** Markdown. */
  prompt: string;
  points: number;
  options: ChoiceOption[];
  /** Several answers only: credit per correct pick, minus each wrong pick. */
  partialCredit: boolean;
  /** What a full-marks answer looks like (people-scored types). */
  rubric: string;
  language: string;
  starterCode: string;
  /** File types the candidate may upload, for example ".pdf,.zip". */
  accept: string;
};

export type Section = { id: string; title: string; questions: Question[] };

export type Content = {
  instructions: string;
  minutes: number;
  timed: boolean;
  passMark: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  tabSwitch: boolean;
  fullscreen: boolean;
  blockPaste: boolean;
  sections: Section[];
};

export const questionTypeLabels: Record<QuestionType, string> = {
  single: 'Multiple choice (one answer)',
  multi: 'Multiple choice (several answers)',
  short: 'Short answer',
  long: 'Written answer',
  code: 'Code',
  file: 'File upload',
};

/** Languages offered for code questions. Highlighting covers all of them. */
export const codeLanguages = ['JavaScript', 'TypeScript', 'Python', 'SQL', 'Java', 'C#', 'Go'];

/** File types a take-home can accept (the server checks the same list). */
export const uploadTypes = [
  '.pdf',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.zip',
  '.txt',
  '.md',
  '.csv',
];

export const isAutoScored = (q: Pick<Question, 'type'>) =>
  q.type === 'single' || q.type === 'multi';

/** "1 question", "3 questions". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Points for a choice question: the exact set, or partial credit (correct minus wrong, never below 0). */
export function autoPoints(q: Question, picked: string[] | undefined): number {
  if (!isAutoScored(q) || !picked) return 0;
  const correct = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
  const chosen = new Set(picked.filter((id) => q.options.some((o) => o.id === id)));
  if (correct.size === 0) return 0;
  if (q.type === 'multi' && q.partialCredit) {
    let right = 0;
    for (const id of chosen) if (correct.has(id)) right++;
    const wrong = chosen.size - right;
    return Math.round(((q.points * Math.max(0, right - wrong)) / correct.size) * 100) / 100;
  }
  return chosen.size === correct.size && [...correct].every((id) => chosen.has(id)) ? q.points : 0;
}

/** What stops a question from being published. Empty means it is fine. Mirrors the server's list. */
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

export const allQuestions = (c: Pick<Content, 'sections'>) =>
  c.sections.flatMap((s) => s.questions);

/** Every problem, numbered the way the builder shows questions. */
export function contentProblems(c: Content): string[] {
  const out: string[] = [];
  if (c.timed && !(c.minutes >= 5 && c.minutes <= 600))
    out.push('Set the timer between 5 and 600 minutes');
  if (!(c.passMark >= 1 && c.passMark <= 100)) out.push('Set a pass mark between 1 and 100');
  if (c.sections.some((s) => !s.title.trim())) out.push('Give every section a title');
  const qs = allQuestions(c);
  if (qs.length === 0) out.push('Add at least one question');
  qs.forEach((q, i) =>
    questionProblems(q).forEach((p) => out.push(`Question ${i + 1}: ${p.toLowerCase()}`)),
  );
  return out;
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function newQuestion(type: QuestionType, id = uid()): Question {
  const opt = (): ChoiceOption => ({ id: uid(), text: '', correct: false });
  return {
    id,
    type,
    prompt: '',
    points: type === 'long' || type === 'code' || type === 'file' ? 10 : 2,
    options: type === 'single' || type === 'multi' ? [opt(), opt(), opt()] : [],
    partialCredit: false,
    rubric: '',
    language: type === 'code' ? 'JavaScript' : '',
    starterCode: '',
    accept: type === 'file' ? '.pdf,.zip' : '',
  };
}

export const newSection = (n: number): Section => ({
  id: uid(),
  title: `Section ${n}`,
  questions: [],
});

/** Copies questions with fresh ids, so nothing is shared with where they came from. */
export const copyQuestion = (q: Question): Question => ({
  ...q,
  id: uid(),
  options: q.options.map((o) => ({ ...o, id: uid() })),
});

export const emptyContent = (): Content => ({
  instructions:
    'Work through each section in order. Your answers save as you go. Use your own words and do not ask anyone for help.',
  minutes: 45,
  timed: true,
  passMark: 70,
  shuffleQuestions: false,
  shuffleOptions: false,
  tabSwitch: true,
  fullscreen: false,
  blockPaste: false,
  sections: [{ id: uid(), title: 'Section 1', questions: [newQuestion('single')] }],
});

/** Stable 32-bit FNV-1a, the same as the server's. */
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

/** The bucket label a pass mark falls in, for the chart's reference line. */
export const bucketOf = (percent: number) =>
  scoreBuckets([percent]).find((b) => b.candidates)!.range;

export type IntegrityEvent = {
  type: string;
  at: string;
  questionId?: string | null;
  seconds?: number | null;
};

/** Plain summary lines for the reviewer: "Left the tab 3 times, longest 2 minutes". */
export function integritySummary(events: IntegrityEvent[]): string[] {
  const left = events.filter((e) => e.type === 'left').length;
  const away = events.filter((e) => e.type === 'returned').map((e) => e.seconds ?? 0);
  const exits = events.filter((e) => e.type === 'fullscreen-exit').length;
  const pastes = events.filter((e) => e.type === 'paste-blocked' || e.type === 'paste').length;
  const out: string[] = [];
  if (left) {
    const longest = Math.max(0, ...away);
    out.push(
      `Left the tab ${plural(left, 'time')}${longest ? `, longest ${duration(longest)}` : ''}`,
    );
  }
  if (exits) out.push(`Left full screen ${plural(exits, 'time')}`);
  if (pastes) out.push(`Tried to paste ${plural(pastes, 'time')}`);
  return out;
}

/** "45 seconds", "2 minutes", "1 hour 5 minutes". */
export function duration(seconds: number): string {
  if (seconds < 60) return plural(Math.max(0, Math.round(seconds)), 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${plural(h, 'hour')} ${plural(m, 'minute')}` : plural(h, 'hour');
}

/** "12:05" or "1:02:05" for a countdown. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Line diff (longest common subsequence) for the reviewer's "Changes from the starter code". */
export function lineDiff(
  before: string,
  after: string,
): { kind: 'same' | 'added' | 'removed'; text: string }[] {
  const a = before.replace(/\s+$/, '').split('\n');
  const b = after.replace(/\s+$/, '').split('\n');
  // ponytail: O(n·m) table; fine for answers of a few hundred lines.
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { kind: 'same' | 'added' | 'removed'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'removed', text: a[i++] });
    else out.push({ kind: 'added', text: b[j++] });
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] });
  return out;
}

/** First line of a Markdown prompt as plain text, for tables and charts. */
export function promptLine(markdown: string, max = 90): string {
  const line =
    markdown
      .split('\n')
      .map((l) =>
        l
          .replace(/^[#>*\-\d.\s`]+/, '')
          .replace(/[*_`[\]]/g, '')
          .trim(),
      )
      .find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
