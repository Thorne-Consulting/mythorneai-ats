// A job's place and pay as people read them, and the create-job wizard's form and request.
// Pure (type imports only), so job-form.check.mjs runs it with node.
import type { QuestionDraft } from '../careers/questions';

// ---- Place and pay ----
export type Place = { city: string; region: string; country: string; remoteCountries: string[] };
export type Pay = {
  min: number | '';
  max: number | '';
  currency: string;
  period: 'Year' | 'Month' | 'Hour';
  show: boolean;
};

export const EMPTY_PLACE: Place = { city: '', region: '', country: '', remoteCountries: [] };
export const EMPTY_PAY: Pay = { min: '', max: '', currency: 'USD', period: 'Year', show: false };

export const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'INR', 'SGD', 'JPY', 'CHF'];
export const PERIODS = [
  { value: 'Year', label: 'a year' },
  { value: 'Month', label: 'a month' },
  { value: 'Hour', label: 'an hour' },
] as const;

/** "Chicago, Illinois", or the country's name when there is no city, or "Remote". */
export function locationText(place: Place, workMode: string, countryName = (code: string) => code) {
  const parts = [place.city.trim(), place.region.trim()].filter(Boolean);
  if (parts.length === 0 && place.country) parts.push(countryName(place.country));
  if (parts.length === 0 && workMode === 'Remote') return 'Remote';
  return parts.join(', ');
}

/** "USD 90,000 – 120,000 a year", the way the server writes it; null without a range. */
export function payText(pay: Pick<Pay, 'min' | 'max' | 'currency' | 'period'>) {
  const amounts = [pay.min, pay.max].filter((v): v is number => v !== '' && v !== null);
  if (amounts.length === 0) return null;
  const format = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const range =
    amounts.length === 2 && amounts[0] !== amounts[1]
      ? `${format(amounts[0])} – ${format(amounts[1])}`
      : format(amounts[0]);
  const per = PERIODS.find((p) => p.value === pay.period)?.label ?? 'a year';
  return `${pay.currency} ${range} ${per}`;
}

/** The problem with a pay range, or null. */
export function payProblem(pay: Pay) {
  if ((pay.min !== '' && pay.min < 0) || (pay.max !== '' && pay.max < 0))
    return 'Enter amounts of 0 or more.';
  if (pay.min !== '' && pay.max !== '' && pay.min > pay.max)
    return 'The lowest pay should not be more than the highest.';
  if (pay.show && pay.min === '' && pay.max === '') return 'Enter the pay range to show it.';
  return null;
}

// ---- The wizard ----

export type TeamRole = 'HiringManager' | 'Recruiter' | 'Interviewer' | 'Viewer';
export type WizardMember = { userId: string; role: TeamRole };
export type StartFrom = 'blank' | 'template' | 'job';
export type AfterCreate = 'draft' | 'open' | 'submit';

export type WizardForm = {
  startFrom: StartFrom;
  templateId: string | null;
  /** The job to copy stages and interview kits from. */
  copyFromId: string | null;
  title: string;
  department: string;
  employmentType: string;
  workMode: string;
  openings: number | '';
  targetStartDate: string;
  place: Place;
  pay: Pay;
  /** The posting in three parts; the job saves them as one description. */
  intro: string;
  role: string;
  benefits: string;
  questions: QuestionDraft[];
  pipelineTemplateId: string | null;
  members: WizardMember[];
  after: AfterCreate;
};

export const INITIAL_FORM: WizardForm = {
  startFrom: 'blank',
  templateId: null,
  copyFromId: null,
  title: '',
  department: '',
  employmentType: 'Full time',
  workMode: 'Hybrid',
  openings: 1,
  targetStartDate: '',
  place: EMPTY_PLACE,
  pay: EMPTY_PAY,
  intro: '',
  role: '',
  benefits: '',
  questions: [],
  pipelineTemplateId: null,
  members: [],
  after: 'draft',
};

/** The posting as applicants read it: intro, the role, then benefits. */
export function composeDescription(form: Pick<WizardForm, 'intro' | 'role' | 'benefits'>) {
  return [form.intro, form.role, form.benefits]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export type WizardErrors = Partial<
  Record<'title' | 'department' | 'location' | 'openings' | 'pay' | 'members', string>
>;

/** One message per field that needs fixing, keyed so each step can tell if it is done. */
export function validateForm(form: WizardForm): WizardErrors {
  const errors: WizardErrors = {};
  if (!form.title.trim()) errors.title = 'Enter a job title.';
  if (!form.department.trim()) errors.department = 'Enter a team.';
  if (!(Number(form.openings) >= 1)) errors.openings = 'Enter 1 or more openings.';
  if (!locationText(form.place, form.workMode))
    errors.location = 'Enter a city, or a country for remote jobs.';
  const pay = payProblem(form.pay);
  if (pay) errors.pay = pay;
  if (!form.members.some((m) => m.role === 'HiringManager'))
    errors.members = 'Add a hiring manager.';
  return errors;
}

/**
 * POST /api/requisitions, as `CreateRequisitionRequest`. Questions go as the builder's
 * `toInput` of each draft, which the caller passes so this file needs no other module.
 */
export function createPayload(
  form: WizardForm,
  questionInput: (draft: QuestionDraft) => unknown,
  countryName?: (code: string) => string,
) {
  const { pay, place } = form;
  return {
    title: form.title.trim(),
    department: form.department.trim(),
    location: locationText(place, form.workMode, countryName),
    employmentType: form.employmentType,
    workMode: form.workMode,
    openings: Number(form.openings),
    ownerEmail: null,
    recruiterEmail: null,
    description: composeDescription(form),
    targetStartDate: form.targetStartDate || null,
    postingTemplateId: form.startFrom === 'template' ? form.templateId : null,
    pipelineTemplateId: form.copyFromId ? null : form.pipelineTemplateId,
    copyFromId: form.startFrom === 'job' ? form.copyFromId : null,
    members: form.members,
    place: {
      city: place.city.trim() || null,
      region: place.region.trim() || null,
      country: place.country || null,
      remoteCountries: form.workMode === 'Remote' ? place.remoteCountries : [],
    },
    salary: {
      min: pay.min === '' ? null : pay.min,
      max: pay.max === '' ? null : pay.max,
      currency: pay.currency,
      period: pay.period,
      show: pay.show && (pay.min !== '' || pay.max !== ''),
    },
    questions: form.questions.map(questionInput),
  };
}

// ---- Drafts saved to the server as you go ----

export type WizardRequirements = { required: string[]; preferred: string[]; minYears: number | '' };
export type WizardStage = { name: string; type: string };

/** What the wizard saves as a draft: the form, the requirements and stages copied from a job. */
export type WizardDraftData = {
  form: WizardForm;
  reqs: WizardRequirements;
  copyStages: WizardStage[] | null;
};

export const EMPTY_REQUIREMENTS: WizardRequirements = { required: [], preferred: [], minYears: '' };

/** A saved draft back as the wizard's state, with any field added since it was saved filled in. */
export function restoreDraft(data: unknown): WizardDraftData {
  const saved = (data ?? {}) as Partial<{
    form: Partial<WizardForm>;
    reqs: Partial<WizardRequirements>;
    copyStages: WizardStage[] | null;
  }>;
  const form = saved.form ?? {};
  return {
    form: {
      ...INITIAL_FORM,
      ...form,
      place: { ...EMPTY_PLACE, ...form.place },
      pay: { ...EMPTY_PAY, ...form.pay },
      questions: form.questions ?? [],
      members: form.members ?? [],
    },
    reqs: { ...EMPTY_REQUIREMENTS, ...saved.reqs },
    copyStages: Array.isArray(saved.copyStages) ? saved.copyStages : null,
  };
}
