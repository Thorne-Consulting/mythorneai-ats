/*
 * Interview kits and the interview library, without React: the shapes the API returns, the draft
 * the kit editor holds, its checks, and the question bank search. Run the self-check with
 * `node --experimental-strip-types src/features/interview-library/library-model.check.mjs`.
 */

/** One competency as the editor holds it. */
export interface KitCompetency {
  /** The server's competency id. It stays the same across kit versions; none for a new one. */
  id?: string;
  /** Stays put while editing, for list keys and drag and drop. */
  key: string;
  name: string;
  question: string;
  followUps: string;
  /** What a good answer shows. */
  description: string;
  weight: number;
}

export interface KitDraft {
  name: string;
  durationMinutes: number | '';
  pipelineStageId: string | null;
  instructions: string;
  criteria: KitCompetency[];
}

type CompetencyData = Omit<KitCompetency, 'key' | 'id'> & { id?: string };

/** GET /api/requisitions/{id}/interview-kits/{kitId} */
export interface KitDetail {
  id: string;
  name: string;
  instructions: string;
  durationMinutes: number;
  version: number;
  /** Set when this is a frozen earlier version: the kit it belongs to. */
  versionOfId?: string | null;
  pipelineStageId?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  /** Interviews that use exactly this version. */
  interviews: number;
  criteria: Array<CompetencyData & { id: string }>;
}

export interface KitVersion {
  id: string;
  version: number;
  updatedAt: string;
  interviews: number;
  upcoming: number;
}

export interface KitResponse {
  kit: KitDetail;
  versions: KitVersion[];
  canManage: boolean;
}

/** One row of GET /api/requisitions/{id}/interview-kits */
export interface KitListItem {
  id: string;
  name: string;
  durationMinutes: number;
  version: number;
  pipelineStageId?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
  competencies: number;
  interviews: number;
  upcoming: number;
}

export interface KitTemplate {
  id: string;
  name: string;
  summary: string;
  durationMinutes: number;
  instructions: string;
  competencies: CompetencyData[];
  updatedAt: string;
  archivedAt?: string | null;
}

export interface BankQuestion {
  id: string;
  name: string;
  question: string;
  followUps: string;
  goodLooksLike: string;
  weight: number;
  tags: string[];
  updatedAt: string;
  archivedAt?: string | null;
}

let counter = 0;
const newKey = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export function blankCompetency(): KitCompetency {
  return { key: newKey(), name: '', question: '', followUps: '', description: '', weight: 3 };
}

export function blankDraft(pipelineStageId: string | null = null): KitDraft {
  return {
    name: '',
    durationMinutes: 45,
    pipelineStageId,
    instructions: '',
    criteria: [blankCompetency()],
  };
}

/**
 * Kits written before follow-ups had their own field put them in the question as
 * "… Follow-up: …". Shown split, and saved split the next time the kit is saved.
 */
export function splitFollowUp<T extends { question: string; followUps?: string }>(item: T): T {
  const match = /^(.*?)\s+Follow-up:\s+(.+)$/s.exec(item.question);
  return match && !item.followUps ? { ...item, question: match[1], followUps: match[2] } : item;
}

const withKeys = (items: CompetencyData[]) =>
  items.map(splitFollowUp).map((item) => ({
    id: item.id,
    key: item.id ?? newKey(),
    name: item.name,
    question: item.question,
    followUps: item.followUps ?? '',
    description: item.description ?? '',
    weight: item.weight,
  }));

export function draftFromKit(kit: KitDetail): KitDraft {
  return {
    name: kit.name,
    durationMinutes: kit.durationMinutes,
    pipelineStageId: kit.pipelineStageId ?? null,
    instructions: kit.instructions,
    criteria: withKeys(kit.criteria),
  };
}

/** A template copied into a new kit. Its competencies are new ones, with no ids. */
export function draftFromTemplate(
  template: KitTemplate,
  pipelineStageId: string | null = null,
): KitDraft {
  return {
    name: template.name,
    durationMinutes: template.durationMinutes,
    pipelineStageId,
    instructions: template.instructions,
    criteria: withKeys(template.competencies.map((item) => ({ ...item, id: undefined }))),
  };
}

export function competencyFromQuestion(question: BankQuestion): KitCompetency {
  return {
    key: newKey(),
    name: question.name,
    question: question.question,
    followUps: question.followUps,
    description: question.goodLooksLike,
    weight: question.weight,
  };
}

const trimmed = (item: KitCompetency) => ({
  ...(item.id ? { id: item.id } : {}),
  name: item.name.trim(),
  question: item.question.trim(),
  followUps: item.followUps.trim(),
  description: item.description.trim(),
  weight: item.weight,
});

/** The body for POST and PUT /api/requisitions/{id}/interview-kits. */
export function toKitBody(draft: KitDraft) {
  return {
    name: draft.name.trim(),
    durationMinutes: Number(draft.durationMinutes),
    pipelineStageId: draft.pipelineStageId,
    instructions: draft.instructions.trim(),
    criteria: draft.criteria.map(trimmed),
  };
}

export type TemplateBody = ReturnType<typeof toTemplateBody>;

/** The body for the library's templates: the kit's content without ids or a stage. */
export function toTemplateBody(draft: KitDraft, summary = '') {
  const { criteria, pipelineStageId: _stage, ...rest } = toKitBody(draft);
  return {
    ...rest,
    summary: summary.trim(),
    competencies: criteria.map(({ id: _id, ...item }) => item),
  };
}

/** Has anything an interviewer would see changed? */
export function sameDraft(a: KitDraft, b: KitDraft) {
  return JSON.stringify(toKitBody(a)) === JSON.stringify(toKitBody(b));
}

export interface CompetencyErrors {
  name?: string;
  question?: string;
  followUps?: string;
}

export interface KitErrors {
  name?: string;
  duration?: string;
  /** A picture in the instructions without a description (`imageProblem`, passed in). */
  instructions?: string;
  criteria?: string;
  /** By competency key. */
  items: Record<string, CompetencyErrors>;
  ok: boolean;
}

/** The same rules the API applies, shown on the field that breaks them instead of dropping anything. */
export function validateKit(draft: KitDraft, pictureProblem: string | null = null): KitErrors {
  const items: Record<string, CompetencyErrors> = {};
  const seen = new Map<string, string>();
  for (const item of draft.criteria) {
    const errors: CompetencyErrors = {};
    const name = item.name.trim();
    if (!name) errors.name = 'Name the competency';
    else if (name.length > 120) errors.name = 'Keep the name to 120 characters';
    else if (seen.has(name.toLowerCase())) errors.name = 'Another competency has this name';
    if (name) seen.set(name.toLowerCase(), item.key);
    if (!item.question.trim()) errors.question = 'Write the question to ask';
    else if (item.question.trim().length > 1000)
      errors.question = 'Keep the question to 1,000 characters';
    if (item.followUps.trim().length > 2000) errors.followUps = 'Keep this to 2,000 characters';
    if (Object.keys(errors).length) items[item.key] = errors;
  }
  const minutes = Number(draft.durationMinutes);
  const name = draft.name.trim();
  const result: KitErrors = {
    name: !name
      ? 'Give the kit a name'
      : name.length > 120
        ? 'Keep the name to 120 characters'
        : undefined,
    duration:
      draft.durationMinutes === '' || minutes < 15 || minutes > 480
        ? 'Choose 15 to 480 minutes'
        : undefined,
    instructions: pictureProblem ?? undefined,
    criteria:
      draft.criteria.length === 0
        ? 'Add at least one competency'
        : draft.criteria.length > 30
          ? 'A kit can have up to 30 competencies'
          : undefined,
    items,
    ok: false,
  };
  result.ok =
    !result.name &&
    !result.duration &&
    !result.instructions &&
    !result.criteria &&
    !Object.keys(items).length;
  return result;
}

/** Every word typed must appear in the competency, the question, the guidance or a tag. */
export function searchQuestions(items: BankQuestion[], query: string, tag: string | null = null) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (tag && !item.tags.includes(tag)) return false;
    const text =
      `${item.name} ${item.question} ${item.followUps} ${item.goodLooksLike} ${item.tags.join(' ')}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Every tag in use, sorted, for the filter. */
export function tagsOf(items: BankQuestion[]) {
  return [...new Set(items.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b));
}

/** Moves one item from `from` to `to`, for reordering competencies and kits. */
export function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
