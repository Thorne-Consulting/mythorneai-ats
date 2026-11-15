'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2Off } from 'lucide-react';
import { Button, Card, EmptyState, SkeletonRows } from '@/components/ui';
import { OFFLINE } from '@/features/careers/public-api';
import { usePortal } from './PortalProvider';
import { applicationHref, safeNext } from './portal';

/**
 * /candidate-portal/link#<token>: the one-click link from our emails. It confirms the application
 * and signs the person in. The token sits after # so it never reaches a server log.
 */
export function PortalLink() {
  const router = useRouter();
  const { reload, setPrefillEmail, setMessage } = usePortal();
  const [problem, setProblem] = useState<{ text: string; email?: string; next?: string } | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    // Take the token out of the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    (async () => {
      if (!token)
        return setProblem({
          text: 'This link is not complete. Copy the whole link from the email, or sign in with your email.',
        });
      try {
        const response = await fetch('/public/magic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        const body = await response.json().catch(() => ({}));
        const target =
          safeNext(body.path) ??
          (body.applicationId ? applicationHref(body.applicationId) : '/candidate-portal/home');
        if (!response.ok) {
          // A used link from an earlier click: still signed in on this device, so just go there.
          if (body.path && (await reload())) return router.replace(target);
          return setProblem({
            text: body.message ?? 'This link does not work. Sign in with your email instead.',
            email: body.email,
            next: target,
          });
        }
        // The server set the session cookie. If the browser refused it, we are still signed out.
        if (!(await reload()))
          return setProblem({
            text: 'Your browser settings stop us from keeping you signed in. Allow cookies for this site, then open the link again.',
          });
        router.replace(target);
      } catch {
        setProblem({ text: OFFLINE });
      }
    })();
  }, [reload, router]);

  if (!problem)
    return (
      <Card className="mx-auto max-w-md p-6">
        <p className="mb-4 text-base text-fg-muted">Opening your application…</p>
        <SkeletonRows rows={2} className="p-0" />
      </Card>
    );
  return (
    <Card className="mx-auto max-w-md">
      <EmptyState
        icon={Link2Off}
        title="We could not open this link"
        description={problem.text}
        action={
          <Button
            loading={sending}
            onClick={async () => {
              if (problem.email) {
                // Send the code now, so the next screen is the one to type it in.
                setSending(true);
                await fetch('/public/portal/access-code', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: problem.email, next: problem.next }),
                }).catch(() => null);
                setPrefillEmail(problem.email);
              }
              setMessage('');
              router.push(
                problem.next
                  ? `/candidate-portal?next=${encodeURIComponent(problem.next)}`
                  : '/candidate-portal',
              );
            }}
          >
            {problem.email ? 'Email me a sign-in code' : 'Sign in with your email'}
          </Button>
        }
      />
    </Card>
  );
}
