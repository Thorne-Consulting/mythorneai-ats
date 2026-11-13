'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { Alert, Button, Card, Input, SkeletonRows } from '@/components/ui';
import { OFFLINE } from '@/features/careers/public-api';
import { usePortal } from './PortalProvider';
import { DevCandidatesPanel } from './DevCandidatesPanel';
import { writeToken } from './portal';

/** /candidate-portal: email a code, enter it, land on the applications home. */
export function PortalSignIn() {
  const router = useRouter();
  const { portal, loaded, message, setMessage, loadError, reload, returnTo } = usePortal();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Already signed in: the old single-page URL goes straight to the applications.
  useEffect(() => {
    if (!portal) return;
    router.replace(returnTo.current ?? '/candidate-portal/home');
    returnTo.current = null;
  }, [portal, router, returnTo]);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/public/portal/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(response.ok);
      setMessage(
        response.ok
          ? 'If that email is on file, a code is on its way. It can take a minute to arrive.'
          : response.status === 429
            ? 'Too many tries in a short time. Wait a minute, then try again.'
            : 'We could not send a code right now. Please try again shortly.',
      );
    } catch {
      setMessage(OFFLINE);
    }
    setBusy(false);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/public/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      if (!response.ok) {
        setMessage(
          'That code is invalid or expired. Check it and try again, or ask for a new one.',
        );
      } else if (!writeToken((await response.json()).token)) {
        setMessage('Your browser is blocking storage, so we cannot keep you signed in.');
      } else {
        setMessage('');
        await reload();
      }
    } catch {
      setMessage(OFFLINE);
    }
    setBusy(false);
  }

  const notice = message || loadError;
  return (
    <>
      <Card className="mx-auto max-w-md p-6">
        <h1 className="text-3xl font-bold text-fg">Candidate portal</h1>
        <p className="mt-1.5 text-base text-fg-muted">
          See where your application stands, book interviews and message the hiring team. We will
          email you a code to sign in.
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
        <div className="mt-5">
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
            <form onSubmit={verify} className="flex flex-col gap-4">
              <Input
                label="Sign-in code"
                description={`Sent to ${email}.`}
                autoComplete="one-time-code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <Button type="submit" loading={busy} fullWidth>
                Open portal
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setSent(false);
                  setCode('');
                  setMessage('');
                }}
              >
                Use a different email
              </Button>
            </form>
          )}
        </div>
      </Card>
      {loaded && !portal && <DevCandidatesPanel onSignedIn={reload} />}
    </>
  );
}
