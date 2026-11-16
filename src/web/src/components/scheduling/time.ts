// Pure helpers for showing times in a chosen zone. No React, so the check file runs them with
// `node --experimental-strip-types`.

export type Slot = { startsAt: string; endsAt: string };

/** "2026-11-19": the calendar day an instant falls on in a zone. */
export function dayKey(at: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));
}

/** Slots grouped by their day in the zone, in time order. */
export function byDay(slots: Slot[], timeZone: string) {
  const days = new Map<string, Slot[]>();
  for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(slot.startsAt, timeZone);
    days.set(key, [...(days.get(key) ?? []), slot]);
  }
  return days;
}

/** "9:30 AM" in the zone. */
export function timeLabel(at: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );
}

/** "Thursday, November 19" for a day key. Noon UTC keeps the date the same in every zone. */
export function dayLabel(key: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(new Date(`${key}T12:00:00Z`));
}

/** Monday-first weeks covering the month of `key`, as day keys; days outside the month are null. */
export function monthGrid(key: string) {
  const [year, month] = key.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day++)
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** The first day key of the month before (-1) or after (1). */
export function shiftMonth(key: string, by: number) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** The instant a wall-clock time ("2026-11-19", "09:30") means in a zone. */
export function zonedInstant(key: string, time: string, timeZone: string) {
  const guess = new Date(`${key}T${time}:00Z`);
  // The zone's offset at that moment, read back from Intl; twice, for a change of offset in between.
  const offset = (at: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return local - at.getTime();
  };
  const first = new Date(guess.getTime() - offset(guess));
  return new Date(guess.getTime() - offset(first));
}

/** Minutes after midnight in the zone. */
export function minuteOfDay(at: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Add-to-calendar links for Google Calendar and Outlook on the web. */
export function calendarLinks(event: {
  title: string;
  startsAt: string;
  endsAt: string;
  details?: string;
  location?: string | null;
}) {
  const stamp = (at: string) =>
    new Date(at)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
    details: event.details ?? '',
    location: event.location ?? '',
  });
  const outlook = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.startsAt).toISOString(),
    enddt: new Date(event.endsAt).toISOString(),
    body: event.details ?? '',
    location: event.location ?? '',
  });
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.office.com/calendar/0/deeplink/compose?${outlook}`,
  };
}

let zones: { value: string; label: string; keywords: string }[] | null = null;

/** Every zone this browser knows, built once (naming 400 zones is slow to repeat). */
export function zoneOptions() {
  if (zones) return zones;
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
  zones = ids.map((zone) => ({
    value: zone,
    label: zone.replaceAll('_', ' '),
    keywords: `${zone} ${zoneLongName(zone)}`,
  }));
  return zones;
}

/** "Central Standard Time". */
export function zoneLongName(timeZone: string, at: Date = new Date()) {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? timeZone
    );
  } catch {
    return timeZone;
  }
}
