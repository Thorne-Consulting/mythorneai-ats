// Template variables: {{first_name}} and friends. Pure, so template-vars.check.mjs runs it with node.

export const templateVariables = [
  { key: 'first_name', label: 'First name', example: 'Karen' },
  { key: 'last_name', label: 'Last name', example: 'Dela Cruz' },
  { key: 'candidate_name', label: 'Full name', example: 'Karen Dela Cruz' },
  { key: 'job_title', label: 'Job title', example: 'Software Engineer' },
  { key: 'stage', label: 'Current stage', example: 'Interview' },
  { key: 'interview_time', label: 'Next interview', example: 'Fri, Oct 16 · 10:00 AM' },
  { key: 'sender_name', label: 'Your name', example: 'Alex Morgan' },
  { key: 'company', label: 'Company', example: 'MyThorneAI' },
] as const;

/** "first_name" → "First name"; unknown keys stay as written. */
export const variableLabel = (key: string) =>
  templateVariables.find((v) => v.key === key)?.label ?? key;

export type VariableValues = Partial<Record<string, string>>;

const pattern = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Variable keys used in a text, in order of first use. */
export function variablesIn(text: string): string[] {
  return [...new Set([...text.matchAll(pattern)].map((m) => m[1]))];
}

/**
 * Replace {{key}} with its value. Unknown keys and keys without a value are left as written, and
 * returned in `missing` so the user can fill them in by hand.
 */
export function fillTemplate(text: string, values: VariableValues) {
  const missing = new Set<string>();
  const out = text.replace(pattern, (whole, key: string) => {
    const v = values[key];
    if (v === undefined || v === '') {
      missing.add(key);
      return whole;
    }
    return v;
  });
  return { text: out, missing: [...missing] };
}

/** Values for one candidate. */
export function candidateValues(c: {
  name: string;
  role: string;
  stage: string;
  nextInterview?: { when: string };
}): VariableValues {
  const [first, ...rest] = c.name.split(' ');
  return {
    first_name: first,
    last_name: rest.join(' '),
    candidate_name: c.name,
    job_title: c.role,
    stage: c.stage,
    interview_time: c.nextInterview?.when,
    sender_name: 'Alex Morgan',
    company: 'MyThorneAI',
  };
}
