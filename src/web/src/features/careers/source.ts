// Where an applicant came from: `?src=linkedin` on a shared link, or the usual utm_* tags. Kept in
// the browser for 30 days, so it survives a new tab and a later visit, not only the click from the
// job page to the apply page.
const KEY = 'careers-source';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const FIELDS = {
  src: 'source',
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
} as const;
export type Source = Partial<Record<(typeof FIELDS)[keyof typeof FIELDS], string>>;

/** Only the tags from this address, as `?src=…`, or '' when there are none. For links that carry them on. */
export function sourceQuery(search: string) {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const param of Object.keys(FIELDS)) {
    const value = params.get(param)?.trim();
    if (value) kept.set(param, value);
  }
  return kept.size ? `?${kept}` : '';
}

/** Save the tags in this address, if it has any. The first tagged visit wins until it expires. */
export function captureSource(search: string) {
  const params = new URLSearchParams(search);
  const found: Source = {};
  for (const [param, field] of Object.entries(FIELDS)) {
    const value = params.get(param)?.trim().slice(0, 100);
    if (value) found[field] = value;
  }
  if (!Object.keys(found).length) return;
  try {
    if (!Object.keys(readSource()).length)
      localStorage.setItem(KEY, JSON.stringify({ ...found, until: Date.now() + KEEP_MS }));
  } catch {
    // storage blocked: the application says "Career site"
  }
}

export function readSource(): Source {
  try {
    const { until, ...tags } = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Source & {
      until?: unknown;
    };
    if (typeof until !== 'number' || until < Date.now()) return {};
    return tags;
  } catch {
    return {};
  }
}
