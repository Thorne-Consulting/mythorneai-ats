// The candidate's offer page: types for GET /public/portal/applications/{id}/offer and pure helpers.
// No imports, so `offer.check.mjs` can run it with node.

export type PortalOfferStatus = 'Sent' | 'Accepted' | 'Declined' | 'Expired' | 'Withdrawn';

export type PortalOffer = {
  id: string;
  status: PortalOfferStatus;
  jobTitle: string;
  company?: string | null;
  candidateName: string;
  /** The letter as it was sent (Markdown), or null when the team sent the terms only. */
  letter?: string | null;
  terms: { label: string; value: string }[];
  /** When it closes; null when it has no deadline. */
  expiresAt?: string | null;
  sentAt: string;
  respondedAt?: string | null;
  /** The name they typed to accept in the portal. */
  respondedName?: string | null;
  declineReason?: string | null;
  declineReasons: { key: string; label: string }[];
};

const squash = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** The same rule as the server: same letters in any case, spaces as typed. */
export const nameMatches = (typed: string, fullName: string) =>
  squash(typed).length > 0 && squash(typed) === squash(fullName);

/**
 * "Friday, December 1 at 11:59 PM CST": the last minute the offer is open, in the reader's own
 * time zone, with the zone named. The server's deadline is the first minute it is closed.
 */
export function deadlineText(expiresAt: string, zone?: string | null) {
  return new Date(new Date(expiresAt).getTime() - 60_000).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: zone || undefined,
  });
}

/** "3 days left", "Less than a day left", or null when there is a week or more. */
export function timeLeft(expiresAt: string, now = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0 || ms >= 7 * 86_400_000) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'Less than a day left';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

/** A date for the letter's header and the answer line: "November 14, 2026". */
export const dayText = (value: string, zone?: string | null) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: zone || undefined,
  });
