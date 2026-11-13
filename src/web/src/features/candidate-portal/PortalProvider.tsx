'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button, toast } from '@/components/ui';
import { PublicFrame } from '@/features/careers/PublicFrame';
import { errorText, OFFLINE } from '@/features/careers/public-api';
import { clearToken, readToken, type Portal } from './portal';

type CallResult = { ok: boolean; response: Response | null };
type PortalCtx = {
  portal: Portal | null;
  /** True once we know whether there is a session (and loaded it if there is). */
  loaded: boolean;
  /** Message for the sign-in screen (expired session, signed out). */
  message: string;
  setMessage: (text: string) => void;
  /** A refresh failed; the last good data stays on screen. */
  loadError: string;
  reload: () => Promise<void>;
  /** Signed-in call. Handles an expired session and shows a toast on failure. */
  call: (path: string, body?: unknown, fallback?: string) => Promise<CallResult>;
  signOut: (text: string) => void;
  /** Where to go after signing in, when a signed-in page sent the visitor to sign in. */
  returnTo: RefObject<string | null>;
};

const Ctx = createContext<PortalCtx | null>(null);
export function usePortal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}

/** For signed-in routes: no session sends the visitor to sign in. */
export function useSignedInPortal() {
  const ctx = usePortal();
  const router = useRouter();
  // Only a missing or expired session means "sign in"; a failed load (offline, rate limited)
  // keeps the visitor here with a retry.
  const missing = ctx.loaded && !ctx.portal && !ctx.loadError && !readToken();
  useEffect(() => {
    if (!missing) return;
    ctx.returnTo.current = window.location.pathname;
    router.replace('/candidate-portal');
  }, [missing, router, ctx.returnTo]);
  return ctx;
}

const EXPIRED = 'Your sign-in has expired. Enter your email to get a new code.';

/** One session and one copy of GET /public/portal for every candidate-portal route. */
export function PortalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const returnTo = useRef<string | null>(null);

  const signOut = useCallback(
    (text: string) => {
      clearToken();
      setPortal(null);
      setMessage(text);
      router.push('/candidate-portal');
    },
    [router],
  );

  const reload = useCallback(async () => {
    const token = readToken();
    if (!token) {
      setLoaded(true);
      return;
    }
    try {
      const response = await fetch('/public/portal', { headers: { 'X-Candidate-Session': token } });
      if (response.ok) {
        setPortal(await response.json());
        setLoadError('');
      } else if (response.status === 401) signOut(EXPIRED);
      else setLoadError('We could not refresh this page. Please try again in a moment.');
    } catch {
      setLoadError(OFFLINE);
    }
    setLoaded(true);
  }, [signOut]);

  useEffect(() => {
    reload();
  }, [reload]);

  const call = useCallback(
    async (
      path: string,
      body?: unknown,
      fallback = 'That did not work. Please try again.',
    ): Promise<CallResult> => {
      try {
        const response = await fetch(path, {
          method: path.endsWith('/availability') ? 'GET' : 'POST',
          headers: {
            'X-Candidate-Session': readToken(),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 401) {
          signOut(EXPIRED);
          return { ok: false, response };
        }
        if (!response.ok) toast.error(await errorText(response, fallback));
        return { ok: response.ok, response };
      } catch {
        toast.error(OFFLINE);
        return { ok: false, response: null };
      }
    },
    [signOut],
  );

  return (
    <Ctx.Provider
      value={{ portal, loaded, message, setMessage, loadError, reload, call, signOut, returnTo }}
    >
      <PublicFrame
        action={
          portal && (
            <Button
              variant="quiet"
              size="sm"
              className="text-nav-foreground hover:bg-nav-hover hover:text-white"
              onClick={() => signOut('You are signed out.')}
            >
              Sign out
            </Button>
          )
        }
      >
        {children}
      </PublicFrame>
    </Ctx.Provider>
  );
}
