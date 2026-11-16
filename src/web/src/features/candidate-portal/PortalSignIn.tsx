'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { Alert, Button, Card, Input, SkeletonRows } from '@/components/ui';
import { OFFLINE } from '@/features/careers/public-api';
import { usePortal } from './PortalProvider';
import { DevCandidatesPanel } from './DevCandidatesPanel';
import { safeNext } from './portal';

const BLOCKED =
  'Your browser settings stop us from keeping you signed in. Allow cookies for this site, then try again.';

/**
 * /candidate-portal: email a code (the email also holds a one-click link), enter it, and land on
 * the page the person was opening, or Home.
 */
export function PortalSignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { portal, loaded, message, setMessage, loadError, reload, prefillEmail, company } =
    usePortal();
  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState('');
  // Coming from an expired email link, the code is already on its way.
  const [sent, setSent] = useState(!!prefillEmail);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(prefillEmail ? 30 : 0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // Signed in (now or already): go where the person was heading.
  useEffect(() => {
    if (portal) router.replace(next ?? '/candidate-portal/home');
  }, [portal, router, next]);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/public/portal/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      });
      setSent(response.ok);
      if (response.ok) {
        setWait(30);
        setCode('');
      }
      setMessage(
        response.ok
          ? ''
          : response.status === 429
            ? 'Too many tries in a short time. Wait a minute, then try again.'
            : 'We could not send a code. Please try again in a few minutes.',
      );
    } catch {
      setMessage(OFFLINE);
    }
    setBusy(false);
  }

  async function verify(value: string) {
    setBusy(true);
    try {
      const response = await fetch('/public/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: value,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) {
        setCode('');
        setMessage('That code is wrong or too old. Check it and try again, or ask for a new one.');
      } else {
        setMessage('');
        // The server set the session cookie. If the browser refused it, we are still signed out.
        if (!(await reload())) setMessage(BLOCKED);
      }
    } catch {
      setMessage(OFFLINE);
    }
    setBusy(false);
  }

  const notice = message || loadError;
  return (
    <>
      <Card className="mx-auto max-w-md p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-fg">Sign in</h1>
        <p className="mt-1.5 text-base text-fg-muted">
          Follow your applications{company ? ` at ${company}` : ''}, pick interview times and
          message the hiring team.
        </p>
        {notice && (
          <Alert
            tone="info"
            className="mt-4"
            action={
              !message && loadError ? (
                <Button variant="secondary" size="sm" onClick={reload}>
                  Try again
                </Button>
              ) : undefined
            }
          >
            {notice}
          </Alert>
        )}
        <div className="mt-6">
          {!loaded || portal ? (
            <SkeletonRows rows={2} className="p-0" />
          ) : !sent ? (
            <form onSubmit={requestCode} className="flex flex-col gap-4">
              <Input
                label="Email"
                description="Use the email you applied with."
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <Button type="submit" loading={busy} leftIcon={<Mail />} fullWidth>
                Email me a sign-in code
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                verify(code.trim());
              }}
              className="flex flex-col gap-4"
            >
              <p className="text-base text-fg">
                If <span className="font-semibold break-all">{email}</span> is on file, we sent it a
                6-digit code and a sign-in link. It can take a minute to arrive.
              </p>
              <Input
                label="Sign-in code"
                description="Not there? Check your spam folder."
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                inputClassName="text-lg font-semibold tracking-[0.4em] tnum"
                value={code}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(value);
                  if (value.length === 6 && !busy) verify(value);
                }}
                required
              />
              <Button type="submit" loading={busy} disabled={code.length < 6} fullWidth>
                Sign in
              </Button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                {wait > 0 ? (
                  <span className="text-fg-subtle tnum" aria-live="polite">
                    Send a new code in {wait} seconds
                  </span>
                ) : (
                  <Button variant="link" size="sm" onClick={() => requestCode()}>
                    Send a new code
                  </Button>
                )}
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSent(false);
                    setCode('');
                    setMessage('');
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
      {loaded && !portal && <DevCandidatesPanel onSignedIn={reload} />}
    </>
  );
}
