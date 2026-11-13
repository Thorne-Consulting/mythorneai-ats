'use client';

import { useQuery } from '@tanstack/react-query';

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
  description: string;
  applicationQuestionsMarkdown: string;
  targetStartDate?: string | null;
};

export type PublicJobPage = { items: PublicJob[]; total: number; offset: number; limit: number };

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

/** Company name for the public chrome ("Acme careers"). */
export function useCompany() {
  return useQuery({
    queryKey: ['public', 'organization'],
    queryFn: () => publicFetch<{ name?: string | null }>('/public/organization'),
    staleTime: Infinity,
    select: (data) => data?.name ?? null,
  }).data;
}
