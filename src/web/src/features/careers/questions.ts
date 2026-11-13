// Application questions are free markdown written by the recruiter (ApplicationQuestionsMarkdown).
// We turn them into one text answer each, and send the answers back as markdown (AnswersMarkdown).

export type Question = { text: string; required: boolean };

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const REQUIRED = /\s*(?:\(required\)|\*)\s*$/i;

function toQuestion(raw: string): Question | null {
  const clean = raw.replace(/\*\*|__|`/g, '');
  const required = REQUIRED.test(clean);
  const text = clean.replace(REQUIRED, '').trim();
  return text ? { text, required } : null;
}

/**
 * List items are the questions when there are any; otherwise every line ending in "?"; otherwise
 * every paragraph that is not a heading. Mark a question required with "(required)" or a trailing *.
 */
export function parseQuestions(markdown?: string | null): Question[] {
  const lines = (markdown ?? '').split('\n');
  const items = lines.map((l) => LIST_ITEM.exec(l)?.[1]).filter((l): l is string => !!l);
  const candidates = items.length
    ? items
    : lines.some((l) => l.trim().replace(REQUIRED, '').endsWith('?'))
      ? lines.filter((l) => l.trim().replace(REQUIRED, '').endsWith('?'))
      : (markdown ?? '')
          .split(/\n{2,}/)
          .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
          .filter((p) => p && !p.startsWith('#'));
  return candidates.map(toQuestion).filter((q): q is Question => q !== null);
}

/** "### Question\n\nAnswer" per question, so the hiring team reads them as written. */
export function formatAnswers(questions: Question[], answers: string[]) {
  return questions
    .map((q, i) => `### ${q.text}\n\n${answers[i]?.trim() || '_No answer_'}`)
    .join('\n\n');
}
