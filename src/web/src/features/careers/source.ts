// Where an applicant came from: `?src=linkedin` on a shared link, or the usual utm_* tags. Kept for
// the browser tab so it survives the click from the job page to the apply page.
const KEY = 'careers-source';
const FIELDS = {
  src: 'source',
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
} as const;
export type Source = Partial<Record<(typeof FIELDS)[keyof typeof FIELDS], string>>;

/** Save the tags in this address, if it has any. The first tagged visit wins. */
export function captureSource(search: string) {
  const params = new URLSearchParams(search);
  const found: Source = {};
  for (const [param, field] of Object.entries(FIELDS)) {
    const value = params.get(param)?.trim().slice(0, 100);
    if (value) found[field] = value;
  }
  if (!Object.keys(found).length) return;
  try {
    if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // storage blocked: the application says "Career site"
  }
}

export function readSource(): Source {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Source;
  } catch {
    return {};
  }
}
