// Typed application questions: what the job asks on the apply page, the builder's drafts, and the
// rules for each kind of answer. Pure, so questions.check.mjs runs it with node.

export type QuestionType =
  | 'ShortText'
  | 'LongText'
  | 'YesNo'
  | 'SingleChoice'
  | 'MultipleChoice'
  | 'Number'
  | 'Date'
  | 'File'
  | 'Url';

/** A question as the apply page gets it. Knockout answers are never sent to candidates. */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  helpText?: string | null;
  required: boolean;
  options: string[];
};

/** A question as the team sees and edits it. */
export type Question = PublicQuestion & {
  knockoutAnswers: string[];
  sortOrder?: number;
  bankQuestionId?: string | null;
};

/** One row in the builder. `key` stays the same while the row moves; `id` once saved. */
export type QuestionDraft = {
  key: string;
  id?: string;
  type: QuestionType;
  label: string;
  helpText: string;
  required: boolean;
  options: string[];
  knockoutAnswers: string[];
  bankQuestionId?: string | null;
};

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'ShortText', label: 'Short answer' },
  { value: 'LongText', label: 'Paragraph' },
  { value: 'YesNo', label: 'Yes or no' },
  { value: 'SingleChoice', label: 'One choice' },
  { value: 'MultipleChoice', label: 'Several choices' },
  { value: 'Number', label: 'Number' },
  { value: 'Date', label: 'Date' },
  { value: 'File', label: 'File upload' },
  { value: 'Url', label: 'Web link' },
];

export const typeLabel = (type: QuestionType) =>
  QUESTION_TYPES.find((t) => t.value === type)?.label ?? type;

export const hasOptions = (type: QuestionType) =>
  type === 'YesNo' || type === 'SingleChoice' || type === 'MultipleChoice';

let nextKey = 0;
export const newQuestionKey = () => `q-${++nextKey}`;

export function toDraft(
  q: Partial<Question> & { type: QuestionType; label: string },
): QuestionDraft {
  return {
    key: q.id ?? newQuestionKey(),
    id: q.id,
    type: q.type,
    label: q.label,
    helpText: q.helpText ?? '',
    required: !!q.required,
    options: q.type === 'YesNo' ? ['Yes', 'No'] : [...(q.options ?? [])],
    knockoutAnswers: [...(q.knockoutAnswers ?? [])],
    bankQuestionId: q.bankQuestionId ?? null,
  };
}

/** A new, empty question of a type. */
export function blankQuestion(type: QuestionType): QuestionDraft {
  return toDraft({
    type,
    label: '',
    options: type === 'SingleChoice' || type === 'MultipleChoice' ? ['', ''] : [],
  });
}

/** The draft as the API takes it (`QuestionInput`): blank choices dropped, knockouts kept only if still a choice. */
export function toInput(d: QuestionDraft) {
  const options = hasOptions(d.type)
    ? d.type === 'YesNo'
      ? ['Yes', 'No']
      : d.options.map((o) => o.trim()).filter(Boolean)
    : [];
  return {
    id: d.id ?? null,
    type: d.type,
    label: d.label.trim(),
    helpText: d.helpText.trim() || null,
    required: d.required,
    options,
    knockoutAnswers: d.knockoutAnswers.filter((k) => options.includes(k)),
    bankQuestionId: d.bankQuestionId ?? null,
  };
}

/** What is wrong with a draft, or null. The server checks the same rules. */
export function draftProblem(d: QuestionDraft) {
  if (!d.label.trim()) return 'Write the question.';
  if (d.label.trim().length > 300) return 'Keep the question under 300 characters.';
  const input = toInput(d);
  if ((d.type === 'SingleChoice' || d.type === 'MultipleChoice') && input.options.length < 2)
    return 'Add at least two choices.';
  if (input.knockoutAnswers.length > 0 && input.knockoutAnswers.length === input.options.length)
    return 'Leave at least one answer that is not flagged.';
  return null;
}

/** An answer on the apply page: text for most types, a list for several choices, a file token for files. */
export type Answer = { values: string[]; fileToken?: string; fileName?: string };
export const EMPTY_ANSWER: Answer = { values: [] };

export const isEmptyAnswer = (q: PublicQuestion, a: Answer | undefined) =>
  q.type === 'File' ? !a?.fileToken : !(a?.values ?? []).some((v) => v.trim());

/** The message for an answer that needs fixing, or null. Matches the server's checks. */
export function answerProblem(q: PublicQuestion, a: Answer | undefined) {
  if (isEmptyAnswer(q, a))
    return q.required ? (q.type === 'File' ? 'Add a file.' : 'Answer this question.') : null;
  const value = a!.values[0]?.trim() ?? '';
  switch (q.type) {
    case 'ShortText':
      return value.length > 300 ? 'Keep this under 300 characters.' : null;
    case 'LongText':
      return value.length > 5000 ? 'Keep this under 5,000 characters.' : null;
    case 'Number':
      return /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, '')) ? null : 'Enter a number.';
    case 'Date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : 'Enter a date.';
    case 'Url':
      return /^https?:\/\/[^\s]+\.[^\s]+/i.test(value)
        ? null
        : 'Paste the full link, starting with https://';
    default:
      return null;
  }
}

/** The answers as the API takes them (`AnswerInput`), in question order. */
export function toAnswerInputs(questions: PublicQuestion[], answers: Record<string, Answer>) {
  return questions.map((q) => {
    const a = answers[q.id];
    return q.type === 'File'
      ? { questionId: q.id, values: [], fileToken: a?.fileToken ?? null }
      : {
          questionId: q.id,
          values: (a?.values ?? [])
            .map((v) => (q.type === 'Number' ? v.replace(/,/g, '').trim() : v.trim()))
            .filter(Boolean),
        };
  });
}
