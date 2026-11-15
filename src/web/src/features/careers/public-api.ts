import type { PublicQuestion } from './questions';

/**
 * Calls to the public API (`/public/...`, rewritten to the API by Next). No workspace session and
 * no CSRF token, so this does not go through `@/api`. Applicant-facing pages and the candidate
 * portal both use it.
 */

export type PublicJob = {
  id: string;
  code: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number;
  postedAt: string;
  updatedAt: string;
  /** Only on a single job (`GET /public/jobs/{id}`), not in the list. */
  description?: string;
  targetStartDate?: string | null;
  /** Typed questions for the apply page (never their knockout answers). */
  questions?: PublicQuestion[];
  /** Only when the team shows the pay on the posting. */
  salary?: {
    min: number | null;
    max: number | null;
    currency: string;
    period: string;
    text: string | null;
  } | null;
  place?: {
    city: string | null;
    region: string | null;
    country: string | null;
    remoteCountries: string[];
  };
};

export type PublicJobPage = { items: PublicJob[]; total: number; offset: number; limit: number };

export type Facet = { value: string; count: number };
/** Every value with open jobs, with how many, for the board filters. */
export type PublicFacets = {
  total: number;
  departments: Facet[];
  locations: Facet[];
  workModes: Facet[];
};

export class PublicError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const OFFLINE = 'We could not reach the server. Check your connection and try again.';

/** The API's own message, else the first validation error, else friendly copy for the status. */
export async function errorText(response: Response, fallback: string) {
  if (response.status === 429)
    return 'Too many tries in a short time. Wait a minute, then try again.';
  try {
    const body = await response.json();
    if (body?.message) return String(body.message);
    const first = body?.errors && (Object.values(body.errors)[0] as string[] | undefined)?.[0];
    if (first) return first;
  } catch {
    // no body
  }
  return fallback;
}

export async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
  fallback = 'Something went wrong. Please try again.',
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new PublicError(OFFLINE, 0);
  }
  if (!response.ok) throw new PublicError(await errorText(response, fallback), response.status);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const postJson = (path: string, body: unknown, fallback?: string) =>
  publicFetch<unknown>(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    fallback,
  );
