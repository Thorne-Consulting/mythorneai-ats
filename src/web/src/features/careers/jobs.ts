// Pure helpers for the public job pages: readable URLs, "Posted 3 days ago", the meta line, plain
// text for search snippets, and the JobPosting data Google for Jobs reads. No imports, so
// `jobs.check.mjs` runs it with node.

export type JobSummary = {
  id: string;
  title: string;
  department: string;
  location: string;
  workMode: string;
  employmentType: string;
  postedAt?: string | null;
};

const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** "product-designer-<id>": the title for people, the id for us. */
export function jobPath(job: { id: string; title: string }) {
  const slug = job.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `/careers/${slug ? `${slug}-` : ''}${job.id}`;
}

/** The job id from either `/careers/<id>` or `/careers/<slug>-<id>`; null when there is none. */
export function idFromParam(param: string) {
  return GUID.exec(decodeURIComponent(param))?.[1]?.toLowerCase() ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Posted today", "Posted 3 days ago", "Posted 2 weeks ago", then "Posted Nov 3". */
export function postedText(value: string | null | undefined, now = new Date()) {
  if (!value) return null;
  const at = new Date(value);
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days < 1) return 'Posted today';
  if (days < 2) return 'Posted yesterday';
  if (days < 14) return `Posted ${plural(days, 'day')} ago`;
  if (days < 35) return `Posted ${plural(Math.floor(days / 7), 'week')} ago`;
  const sameYear = at.getFullYear() === now.getFullYear();
  return `Posted ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}`;
}

/** "On-site" stays, "OnSite" and "on site" read "On-site"; "Full time" stays. */
export function workModeLabel(mode: string) {
  const m = mode
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (m === 'onsite' || m === 'on-site') return 'On-site';
  if (!mode.trim()) return '';
  return mode.trim().charAt(0).toUpperCase() + mode.trim().slice(1).toLowerCase();
}

/** Location, work mode and type, skipping blanks and a location that already says "Remote". */
export function metaParts(job: Pick<JobSummary, 'location' | 'workMode' | 'employmentType'>) {
  const location = job.location.trim();
  const mode = workModeLabel(job.workMode);
  const sameAsLocation = mode && location.toLowerCase().startsWith(mode.toLowerCase());
  return [location, sameAsLocation ? '' : mode, job.employmentType.trim()].filter(Boolean);
}

/** Markdown to one plain line, for meta descriptions and search snippets. */
export function plainText(markdown: string | null | undefined, max = 155) {
  const text = (markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, ' ')
    .replace(/[|*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}…`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markdown to simple HTML paragraphs and lists, the shape Google for Jobs asks for in `description`. */
export function descriptionHtml(markdown: string | null | undefined) {
  const blocks = (markdown ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) return '';
      if (lines.every((l) => /^([-*+]|\d+[.)])\s+/.test(l)))
        return `<ul>${lines.map((l) => `<li>${escapeHtml(plainText(l, 10_000))}</li>`).join('')}</ul>`;
      return `<p>${lines.map((l) => escapeHtml(plainText(l, 10_000))).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

const EMPLOYMENT: Record<string, string> = {
  'full-time': 'FULL_TIME',
  'part-time': 'PART_TIME',
  contract: 'CONTRACTOR',
  contractor: 'CONTRACTOR',
  temporary: 'TEMPORARY',
  temp: 'TEMPORARY',
  internship: 'INTERN',
  intern: 'INTERN',
  volunteer: 'VOLUNTEER',
  'per-diem': 'PER_DIEM',
};

/** "Full time" → FULL_TIME, the values schema.org lists; anything else becomes OTHER. */
export function employmentTypeLd(value: string) {
  return (
    EMPLOYMENT[
      value
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
    ] ?? 'OTHER'
  );
}

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
    ' ',
  ),
);

/** "Boston, MA" → locality and region, with the US for a state code. Free text stays as locality. */
export function addressOf(location: string) {
  const [locality, region, country] = location.split(',').map((p) => p.trim());
  const address: Record<string, string> = { '@type': 'PostalAddress' };
  if (locality) address.addressLocality = locality;
  if (region) address.addressRegion = region;
  if (country) address.addressCountry = country;
  else if (region && US_STATES.has(region.toUpperCase())) address.addressCountry = 'US';
  return address;
}

type LdPlace = {
  city: string | null;
  region: string | null;
  country: string | null;
  remoteCountries: string[];
};
type LdSalary = { min: number | null; max: number | null; currency: string; period: string };

/** The structured place when the job has one, else read from the location text. */
function addressFor(job: { location: string; place?: LdPlace }) {
  const p = job.place;
  if (!p || !(p.city || p.region || p.country)) return addressOf(job.location);
  const address: Record<string, string> = { '@type': 'PostalAddress' };
  if (p.city) address.addressLocality = p.city;
  if (p.region) address.addressRegion = p.region;
  if (p.country) address.addressCountry = p.country;
  return address;
}

/** schema.org MonetaryAmount for the pay range, or nothing without one. */
export function baseSalaryLd(salary: LdSalary | null | undefined) {
  if (!salary || (salary.min == null && salary.max == null)) return {};
  const unit = { Hour: 'HOUR', Month: 'MONTH' }[salary.period] ?? 'YEAR';
  const value: Record<string, string | number> = { '@type': 'QuantitativeValue', unitText: unit };
  if (salary.min != null && salary.max != null && salary.min !== salary.max) {
    value.minValue = salary.min;
    value.maxValue = salary.max;
  } else value.value = (salary.min ?? salary.max)!;
  return { baseSalary: { '@type': 'MonetaryAmount', currency: salary.currency, value } };
}

/** schema.org JobPosting for Google for Jobs. Remote jobs say so instead of giving an office. */
export function jobPostingLd(
  job: JobSummary & {
    code?: string;
    description?: string | null;
    place?: LdPlace;
    salary?: LdSalary | null;
  },
  site: { company: string; url: string; origin: string },
) {
  const remote = job.workMode.trim().toLowerCase() === 'remote';
  const posted = job.postedAt ? new Date(job.postedAt) : null;
  const countries = job.place?.remoteCountries?.length
    ? job.place.remoteCountries
    : /\b(US|USA|United States)\b/i.test(job.location)
      ? ['US']
      : [];
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: descriptionHtml(job.description) || `<p>${escapeHtml(job.title)}</p>`,
    ...(posted ? { datePosted: posted.toISOString().slice(0, 10) } : {}),
    // Open jobs are reviewed at least every 90 days; Google drops postings past this date.
    ...(posted
      ? { validThrough: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) }
      : {}),
    employmentType: employmentTypeLd(job.employmentType),
    hiringOrganization: { '@type': 'Organization', name: site.company, sameAs: site.origin },
    ...(job.code
      ? { identifier: { '@type': 'PropertyValue', name: site.company, value: job.code } }
      : {}),
    ...(remote
      ? {
          jobLocationType: 'TELECOMMUTE',
          ...(countries.length
            ? {
                // One country as an object (the common case), several as a list.
                applicantLocationRequirements:
                  countries.length === 1
                    ? { '@type': 'Country', name: countries[0] }
                    : countries.map((name) => ({ '@type': 'Country', name })),
              }
            : {}),
        }
      : { jobLocation: { '@type': 'Place', address: addressFor(job) } }),
    ...baseSalaryLd(job.salary),
    directApply: true,
    url: site.url,
  };
}

/** For a `<script type="application/ld+json">`: `<` escaped so the text cannot close the tag. */
export const ldJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
