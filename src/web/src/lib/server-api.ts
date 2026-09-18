import { cache } from 'react';
import { headers } from 'next/headers';

export class ServerApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const request = cache(async (path: string, cookie: string) => {
  const origin = process.env.API_ORIGIN ?? 'http://localhost:5080';
  const response = await fetch(new URL(path, origin), {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ServerApiError(`API request failed with ${response.status}.`, response.status);
  }

  return response.json() as Promise<unknown>;
});

export async function serverApiGet<T>(path: string): Promise<T> {
  const cookie = (await headers()).get('cookie') ?? '';
  return (await request(path, cookie)) as T;
}
