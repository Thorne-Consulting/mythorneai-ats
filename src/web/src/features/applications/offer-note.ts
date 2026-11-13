// Plain TS (no path aliases) so the check can run under node --experimental-strip-types.

/**
 * What the offer builder collects. The API stores an offer as one note for the approvers, so the
 * structured terms are written into that note; the candidate gets the standard acceptance email.
 */
export interface OfferTerms {
  baseSalary: number | '';
  currency: string;
  payPeriod: 'year' | 'month' | 'hour';
  bonus: string;
  equity: string;
  startDate: string;
  employmentType: string;
  workMode: string;
  location: string;
  validUntil: string;
  notes: string;
}

export const emptyOfferTerms = (): OfferTerms => ({
  baseSalary: '',
  currency: 'USD',
  payPeriod: 'year',
  bonus: '',
  equity: '',
  startDate: '',
  employmentType: 'Full-time',
  workMode: 'On-site',
  location: '',
  validUntil: '',
  notes: '',
});

const longDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

/** The note approvers read: one line per term that was filled in, then the free text. */
export function composeOfferNote(terms: OfferTerms): string {
  const lines: string[] = [];
  if (terms.baseSalary !== '')
    lines.push(
      `Base salary: ${terms.currency} ${new Intl.NumberFormat('en-US').format(terms.baseSalary)} per ${terms.payPeriod}`,
    );
  if (terms.bonus.trim()) lines.push(`Bonus: ${terms.bonus.trim()}`);
  if (terms.equity.trim()) lines.push(`Equity: ${terms.equity.trim()}`);
  if (terms.startDate) lines.push(`Start date: ${longDate(terms.startDate)}`);
  const role = [terms.employmentType, terms.workMode, terms.location.trim()].filter(Boolean);
  if (role.length) lines.push(`Role: ${role.join(' · ')}`);
  if (terms.validUntil) lines.push(`Offer valid until: ${longDate(terms.validUntil)}`);
  const notes = terms.notes.trim();
  return [lines.join('\n'), notes].filter(Boolean).join('\n\n');
}
