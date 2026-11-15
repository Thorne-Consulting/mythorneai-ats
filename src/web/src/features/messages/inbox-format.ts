// Pure helpers for the inbox, so inbox-format.check.mjs can run them with node.

/** The first row for each thread, in order: a thread that moved up while paging appears once. */
export function uniqueThreads<T extends { applicationId: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.applicationId) && seen.add(row.applicationId));
}

/** Message previews are Markdown; lists show them as one plain line. */
export const plainPreview = (markdown: string) =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\{\{\s*\w+\s*\}\}/g, '…')
    .replace(/<\/?u>/g, '')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/** "9:42 AM" today, "Tue" this week, "Nov 3" this year, "Nov 3, 2025" before. */
export function listTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

/** "Later today", "Tomorrow", "Monday": snooze and send-later choices at 9 AM local time. */
export function timePresets(now = new Date()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const presets: { label: string; at: Date }[] = [];
  if (now.getHours() < 15) presets.push({ label: 'Later today', at: at(0, now.getHours() + 3) });
  presets.push({ label: 'Tomorrow morning', at: at(1, 9) });
  const toMonday = (8 - now.getDay()) % 7 || 7;
  presets.push({ label: 'Next Monday', at: at(toMonday, 9) });
  return presets;
}

/** "Tomorrow, 9:00 AM" or "Mon, Nov 16, 9:00 AM". */
export function whenText(value: string | Date, today = new Date()) {
  const date = new Date(value);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}
