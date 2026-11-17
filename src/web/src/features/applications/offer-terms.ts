// Plain TS (no path aliases) so the check can run under node --experimental-strip-types.

export type OfferTerms = {
  baseSalary?: number | null;
  currency: string;
  payPeriod: string;
  bonus: string;
  equity: string;
  startDate?: string | null;
  employmentType: string;
  workMode: string;
  location: string;
  expiresOn?: string | null;
};

/**
 * "€120,000 per year": the symbol (with its region for dollars, like "CA$") and the currency's
 * decimals. A code the browser does not know is written as "XYZ 120,000".
 */
export function formatPay(amount: number, currency: string, period: string) {
  let number: string;
  try {
    number = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).format(amount);
  } catch {
    number = `${currency.toUpperCase()} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return `${number} per ${period.toLowerCase()}`;
}

/** A date-only value ("2027-03-01") as "March 1, 2027", without a time zone shift. */
export function longDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Label and value for each term that is filled in, in reading order. */
export function termRows(terms: OfferTerms): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (terms.baseSalary != null)
    rows.push({
      label: 'Base salary',
      value: formatPay(terms.baseSalary, terms.currency, terms.payPeriod),
    });
  if (terms.bonus.trim()) rows.push({ label: 'Bonus', value: terms.bonus.trim() });
  if (terms.equity.trim()) rows.push({ label: 'Equity', value: terms.equity.trim() });
  if (terms.startDate) rows.push({ label: 'Start date', value: longDate(terms.startDate) });
  const role = [terms.employmentType, terms.workMode, terms.location.trim()].filter(Boolean);
  if (role.length) rows.push({ label: 'Role', value: role.join(', ') });
  if (terms.expiresOn) rows.push({ label: 'Open until', value: longDate(terms.expiresOn) });
  return rows;
}

/** Where the offer is on Draft → Approval → Approved → Sent → Accepted. */
export const OFFER_STEPS = ['Draft', 'Approval', 'Approved', 'Sent', 'Accepted'];
export function offerStep(status: string) {
  return (
    { Draft: 0, PendingApproval: 1, Approved: 2, Sent: 3, Declined: 3, Expired: 3, Accepted: 5 }[
      status
    ] ?? 0
  );
}
