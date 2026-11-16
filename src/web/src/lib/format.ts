/** Enum values to sentence case: `PendingApproval` reads as "Pending approval". */
export function humanize(value: string) {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** How dates read: this browser's language, Nov 13, 2026, 13 Nov 2026, or 2026-11-13 (Settings → Preferences). */
export type DateOrder = 'auto' | 'month' | 'day' | 'iso';
const DATE_LOCALES: Record<DateOrder, string | undefined> = {
  auto: undefined,
  month: 'en-US',
  day: 'en-GB',
  iso: 'sv-SE',
};
// ponytail: one module-level value, set from the signed-in person before the app renders
// (AuthProvider). A per-request store would be needed if dates were formatted for several people
// in one server render.
let dateOrder: DateOrder = 'auto';
export function setDateOrder(order: DateOrder | null | undefined) {
  dateOrder = order && order in DATE_LOCALES ? order : 'auto';
}

export function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(
    DATE_LOCALES[dateOrder],
    dateOrder === 'iso'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`));
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (dateOrder === 'iso')
    return `${formatDate(value)} ${new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  return new Intl.DateTimeFormat(DATE_LOCALES[dateOrder], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// "3 hours ago", "2 days ago": for things where how long ago matters more than the exact moment.
export function formatRelative(value: string, now = new Date()) {
  const minutes = Math.round((now.getTime() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
