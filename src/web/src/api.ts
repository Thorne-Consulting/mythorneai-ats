let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/auth/csrf', { credentials: 'include' });
  if (!response.ok) throw new ApiError('Your session has expired.', response.status);
  const data = (await response.json()) as { token: string };
  csrfToken = data.token;
  return csrfToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method))
    headers.set('X-CSRF-TOKEN', await ensureCsrfToken());

  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      details = undefined;
    }
    const message =
      typeof details === 'object' && details && 'message' in details
        ? String((details as { message: unknown }).message)
        : typeof details === 'object' && details && 'errors' in details
          ? String(
              Object.values((details as { errors: Record<string, string[]> }).errors)[0]?.[0] ??
                'Check the highlighted fields and try again.',
            )
          : response.status === 401
            ? 'Please sign in.'
            : 'The request could not be completed.';
    throw new ApiError(message, response.status, details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  devLogin: async (email: string) => {
    const response = await fetch('/api/auth/dev-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new ApiError('Development sign-in failed.', response.status);
  },
  upload: async <T>(path: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<T>(path, { method: 'POST', body });
  },
  form: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function resetCsrfToken() {
  csrfToken = null;
}
