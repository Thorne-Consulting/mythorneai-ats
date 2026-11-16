'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui';
import type { PublicBrand } from '@/features/careers/brand';
import { PublicFrame } from '@/features/careers/PublicFrame';
import { errorText, OFFLINE } from '@/features/careers/public-api';
import { HelpDrawer, PortalHeaderNav } from './PortalNav';
import { usePortalLive } from './live';
import { PORTAL_HEADERS, type Portal } from './portal';

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
  /** Loads the portal again. True when someone is signed in. */
  reload: () => Promise<boolean>;
  /**
   * Signed-in call. Handles an expired session and shows a toast on failure. A `FormData` body is
   * sent as a file upload. `method` defaults to POST (GET for availability).
   */
  call: (path: string, body?: unknown, fallback?: string, method?: string) => Promise<CallResult>;
  /** Ends the session on the server and shows `text` on the sign-in page. */
  signOut: (text: string) => Promise<void>;
  /** The address to send a code to, when an email link no longer works. */
  prefillEmail: string;
  setPrefillEmail: (email: string) => void;
  openHelp: () => void;
  /** The employer's name and brand, known before sign-in. */
  company?: string | null;
  brand?: PublicBrand | null;
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
  const missing = ctx.loaded && !ctx.portal && !ctx.loadError;
  useEffect(() => {
    if (!missing) return;
    // In the address, so it survives a reload while the person fetches their code.
    const here = window.location.pathname + window.location.search + window.location.hash;
    router.replace(`/candidate-portal?next=${encodeURIComponent(here)}`);
  }, [missing, router]);
  return ctx;
}

const EXPIRED = 'Your sign-in has expired. Enter your email to get a new code.';

/** One session and one copy of GET /public/portal for every candidate-portal route. */
export function PortalProvider({
  children,
  company,
  brand,
}: {
  children: ReactNode;
  company?: string | null;
  brand?: PublicBrand | null;
}) {
  const router = useRouter();
  const [prefillEmail, setPrefillEmail] = useState('');
  const [help, setHelp] = useState(false);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  // Whether this tab was signed in, so a 401 can say "expired" instead of nothing.
  const signedIn = useRef(false);

  const endSession = useCallback(
    (text: string) => {
      signedIn.current = false;
      setPortal(null);
      setMessage(text);
      router.push('/candidate-portal');
    },
    [router],
  );

  const signOut = useCallback(
    async (text: string) => {
      // The server forgets the session and clears the cookie; offline, the cookie still ends in 30 days.
      await fetch('/public/portal/sign-out', { method: 'POST', headers: PORTAL_HEADERS }).catch(
        () => null,
      );
      endSession(text);
    },
    [endSession],
  );

  const reload = useCallback(async () => {
    let ok = false;
    try {
      // The session cookie goes along by itself. 204 means nobody is signed in.
      const response = await fetch('/public/portal');
      if (response.status === 200) {
        setPortal(await response.json());
        signedIn.current = true;
        ok = true;
        setLoadError('');
      } else if (response.status === 204) setPortal(null);
      else if (response.status === 401) {
        if (signedIn.current) endSession(EXPIRED);
        else setPortal(null);
      } else setLoadError('We could not refresh this page. Please try again in a moment.');
    } catch {
      setLoadError(OFFLINE);
    }
    setLoaded(true);
    return ok;
  }, [endSession]);

  useEffect(() => {
    reload();
  }, [reload]);
  // New team messages, read receipts and interview changes appear without a refresh.
  usePortalLive(!!portal, reload);

  const call = useCallback(
    async (
      path: string,
      body?: unknown,
      fallback = 'That did not work. Please try again.',
      method?: string,
    ): Promise<CallResult> => {
      const form = body instanceof FormData;
      try {
        const response = await fetch(path, {
          method: method ?? (path.endsWith('/availability') ? 'GET' : 'POST'),
          headers: {
            ...PORTAL_HEADERS,
            ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body === undefined ? undefined : form ? body : JSON.stringify(body),
        });
        if (response.status === 401) {
          endSession(EXPIRED);
          return { ok: false, response };
        }
        if (!response.ok) toast.error(await errorText(response, fallback));
        return { ok: response.ok, response };
      } catch {
        toast.error(OFFLINE);
        return { ok: false, response: null };
      }
    },
    [endSession],
  );

  return (
    <Ctx.Provider
      value={{
        portal,
        loaded,
        message,
        setMessage,
        loadError,
        reload,
        call,
        signOut,
        prefillEmail,
        setPrefillEmail,
        openHelp: () => setHelp(true),
        company,
        brand,
      }}
    >
      <PublicFrame
        company={company ?? portal?.company}
        brand={brand}
        tabBar={!!portal}
        nav={
          portal ? (
            <PortalHeaderNav
              portal={portal}
              onHelp={() => setHelp(true)}
              onSignOut={() => signOut('You are signed out.')}
            />
          ) : undefined
        }
        footer={
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="rounded-sm font-medium text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Need help?
          </button>
        }
      >
        {children}
      </PublicFrame>
      <HelpDrawer opened={help} onClose={() => setHelp(false)} />
    </Ctx.Provider>
  );
}
