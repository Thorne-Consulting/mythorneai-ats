// Public API calls made while the web server renders the careers pages. Server components only.
import { cache } from 'react';
import { headers } from 'next/headers';
import type { PublicBrand } from './brand';
import type { PublicFacets, PublicJob, PublicJobPage } from './public-api';
import type { CurrencyInfo, RateTable } from '@/features/currencies/money';

const API = process.env.API_ORIGIN ?? 'http://localhost:5080';

export class ApiUnavailable extends Error {}

/** GET from the public API. 404 is null; anything else that fails throws so the error page shows. */
async function get<T>(path: string): Promise<T | null> {
  const incoming = await headers();
  // Pass the visitor's address on, so the API's per-person limits count people, not this server.
  const forwardedFor = incoming.get('x-forwarded-for');
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : undefined,
    });
  } catch {
    throw new ApiUnavailable('We could not reach the server.');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiUnavailable(`The server answered ${response.status}.`);
  return (await response.json()) as T;
}

export type PublicOrganization = {
  name?: string | null;
  publicUrl?: string | null;
  brand?: PublicBrand | null;
};

export const getOrganization = cache(
  async () => (await get<PublicOrganization>('/public/organization')) ?? {},
);

/** GET /public/currencies: the supported currencies, the base and the rate table, for pay on the site. */
export type PublicCurrencies = {
  base: string;
  currencies: CurrencyInfo[];
  rates: RateTable | null;
};

export const getCurrencies = cache(
  async () =>
    (await get<PublicCurrencies>('/public/currencies')) ?? {
      base: 'USD',
      currencies: [],
      rates: null,
    },
);

export const getJob = cache((id: string) => get<PublicJob>(`/public/jobs/${id}`));

export type PostingPreview = PublicJob & { status: string; listed: boolean };

/**
 * A job as applicants will see it, whatever its status, for the posting preview. Sent with the
 * visitor's own workspace sign-in, so only people who manage the job get it; anyone else gets null.
 */
export async function getPostingPreview(id: string) {
  const cookie = (await headers()).get('cookie');
  try {
    const response = await fetch(`${API}/api/requisitions/${id}/posting-preview`, {
      cache: 'no-store',
      headers: cookie ? { Cookie: cookie } : undefined,
    });
    return response.ok ? ((await response.json()) as PostingPreview) : null;
  } catch {
    throw new ApiUnavailable('We could not reach the server.');
  }
}

export type BoardFilters = {
  q?: string;
  department?: string[];
  location?: string[];
  mode?: string[];
};

export async function getJobs(filters: BoardFilters, limit = 200) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.q) params.set('query', filters.q);
  for (const [key, values] of [
    ['department', filters.department],
    ['location', filters.location],
    ['mode', filters.mode],
  ] as const)
    for (const value of values ?? []) params.append(key, value);
  return (
    (await get<PublicJobPage>(`/public/jobs?${params}`)) ?? {
      items: [],
      total: 0,
      offset: 0,
      limit,
    }
  );
}

export const getFacets = cache(
  async () =>
    (await get<PublicFacets>('/public/jobs/facets')) ?? {
      total: 0,
      departments: [],
      locations: [],
      workModes: [],
    },
);

/**
 * Title, favicon and share defaults for public pages: the employer's name and icon, not ours.
 * The icon address carries a version, so a new upload shows at once.
 */
export async function brandMetadata() {
  const organization = await getOrganization();
  const icon = organization.brand?.iconUrl;
  return {
    company: organization.name?.trim() || 'Company',
    // Only when there is one: a missing key keeps the app's own icon instead of none.
    ...(icon ? { icons: { icon, apple: icon } } : {}),
  };
}

/** Where this site lives: the address saved in settings, else the address this request came to. */
export async function siteOrigin() {
  const saved = (await getOrganization()).publicUrl?.trim();
  if (saved) return saved.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Search params arrive as a string or a list; filters want a clean list. */
export function list(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);
}
