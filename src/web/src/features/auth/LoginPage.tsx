'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, resetCsrfToken } from '@/api';
import { Alert, Avatar, Button, Card, Spinner, Textarea, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import type { User } from '@/types';

type DevUser = Pick<User, 'email' | 'displayName' | 'role'>;

/** Why the sign-in service sent someone back here, in plain words, with what to do next. */
const REASONS: Record<string, { title: string; body: string; retry?: string }> = {
  session: {
    title: 'Your session ended',
    body: 'Sign in again to pick up where you left off.',
    retry: 'Sign in again',
  },
  not_invited: {
    title: 'You don’t have access yet',
    body: 'This workspace is open to invited people only. Ask an admin to invite you, then sign in again.',
    retry: 'Use another account',
  },
  domain: {
    title: 'Use your work email',
    body: 'This workspace only accepts work email addresses. Sign in with your company account.',
    retry: 'Use another account',
  },
  pending: {
    title: 'We asked your admin',
    body: 'Your request to join is waiting for an admin. We’ll email you when you can sign in.',
  },
  declined: {
    title: 'Your request was declined',
    body: 'An admin declined your request to join. You can ask again in a week, or talk to your admin.',
  },
  deactivated: {
    title: 'Your access was removed',
    body: 'Ask an admin of your workspace if you need it back.',
  },
  method: {
    title: 'That way of signing in is turned off',
    body: 'Your workspace doesn’t allow it. Try another way, for example a code sent to your email.',
    retry: 'Try another way',
  },
  provider: {
    title: 'We couldn’t reach the sign-in service',
    body: 'Try again in a moment.',
    retry: 'Try again',
  },
  state: {
    title: 'That sign-in took too long',
    body: 'Start again and it should work.',
    retry: 'Try again',
  },
};

/** Only a path inside this app, never another site, and never back to this page. */
export function safeReturnUrl(value: string | null | undefined) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value.startsWith('/login')
      ? '/'
      : value
    : '/';
}

/**
 * The sign-in page. On the live site it forwards straight to the sign-in service unless there is
 * something to say: an error, a sign-out, or the service being down. In development it lists the
 * test accounts.
 */
export function LoginPage({
  unavailable = false,
  error,
  returnUrl,
  request,
  signedOut = false,
}: {
  unavailable?: boolean;
  error?: string;
  returnUrl?: string;
  /** Token for adding a note to an access request (error=pending). */
  request?: string;
  signedOut?: boolean;
}) {
  const [signingIn, setSigningIn] = useState<string | null>(null);
  // Rendered in place of a workspace page: come back to that page after signing in.
  const [back, setBack] = useState(() => safeReturnUrl(returnUrl));
  useEffect(() => {
    if (returnUrl === undefined && window.location.pathname !== '/login')
      setBack(safeReturnUrl(window.location.pathname + window.location.search));
  }, [returnUrl]);
  const users = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api.get<DevUser[]>('/api/auth/dev-users'),
    retry: false,
  });
  const workspace = useQuery({
    queryKey: ['public-organization'],
    queryFn: () =>
      fetch('/public/organization').then((r) => (r.ok ? r.json() : null)) as Promise<{
        name?: string | null;
        // The employer's own square icon, set under Settings → Careers site.
        brand?: { iconUrl?: string | null } | null;
      } | null>,
    retry: false,
  });
  const reason = error ? (REASONS[error] ?? REASONS.provider) : undefined;
  const signInHref = `/auth/login?returnUrl=${encodeURIComponent(back)}`;
  // Nothing to explain on the live site: go straight to the sign-in service.
  const forward = !unavailable && !reason && !signedOut && users.isError;
  useEffect(() => {
    if (forward) window.location.replace(signInHref);
  }, [forward, signInHref]);

  const login = async (email: string) => {
    setSigningIn(email);
    try {
      resetCsrfToken();
      await api.devLogin(email);
      window.location.assign(back);
    } catch {
      toast.error('Could not sign in', 'Try another test account.');
      setSigningIn(null);
    }
  };

  const name =
    workspace.data?.name && workspace.data.name !== 'Your organization'
      ? workspace.data.name
      : 'MyThorneAI ATS';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={workspace.data?.brand?.iconUrl ?? '/brand/mark.png'}
            alt=""
            width={56}
            height={56}
            className={cn(
              'size-14 object-contain',
              workspace.data?.brand?.iconUrl ? 'rounded-xl' : 'rounded-full',
            )}
          />
          <h1 className="mt-2 text-2xl font-bold text-fg">{name}</h1>
          <p className="text-base text-fg-muted">Sign in with your company account.</p>
        </div>

        <Card className="p-5">
          {users.isPending || forward ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-fg-subtle">
              <Spinner className="size-5" />
              {forward && 'Taking you to sign in…'}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {unavailable && (
                <Alert tone="danger" title="Sign-in is not working right now">
                  Try again in a few minutes. If it keeps happening, tell your admin.
                </Alert>
              )}
              {signedOut && !reason && (
                <Alert tone="success" icon={Check}>
                  You signed out.
                </Alert>
              )}
              {reason && (
                <Alert
                  tone={error === 'pending' ? 'info' : error === 'session' ? 'neutral' : 'warning'}
                  title={reason.title}
                >
                  {reason.body}
                </Alert>
              )}
              {error === 'pending' && request && <RequestNote token={request} />}
              {users.data ? (
                <DevAccounts users={users.data} signingIn={signingIn} onPick={login} />
              ) : (
                (!reason || reason.retry) && (
                  <Button asChild size="lg" fullWidth>
                    <a href={signInHref}>
                      {reason?.retry ?? 'Sign in'}
                      <ArrowRight />
                    </a>
                  </Button>
                )
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function DevAccounts({
  users,
  signingIn,
  onPick,
}: {
  users: DevUser[];
  signingIn: string | null;
  onPick: (email: string) => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 text-xs font-medium text-fg-subtle">Test accounts (development only)</p>
      {users.map((user) => (
        <button
          key={user.email}
          type="button"
          disabled={signingIn !== null}
          onClick={() => onPick(user.email)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Avatar name={user.displayName} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium text-fg">{user.displayName}</span>
            <span className="block truncate text-xs text-fg-subtle">{humanize(user.role)}</span>
          </span>
          {signingIn === user.email ? (
            <Spinner className="text-fg-subtle" />
          ) : (
            <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
          )}
        </button>
      ))}
      <p className="mt-2 text-xs text-fg-subtle">
        On the live site, people sign in with their company account.
      </p>
    </div>
  );
}

/** "Add a note for your admin" on a pending access request. */
function RequestNote({ token }: { token: string }) {
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const response = await fetch('/auth/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, note }),
      });
      if (!response.ok) throw new Error('Sign in again to ask for access.');
    },
    onError: (e: Error) => toast.error('Your note wasn’t sent', e.message),
  });
  if (save.isSuccess)
    return <p className="text-sm text-fg-muted">Thanks. Your admin will see your note.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label="Add a note for your admin (optional)"
        placeholder="For example, your team and why you need access."
        maxLength={1000}
        rows={3}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
      <Button
        variant="secondary"
        disabled={!note.trim()}
        loading={save.isPending}
        onClick={() => save.mutate()}
        className="self-end"
      >
        Send note
      </Button>
    </div>
  );
}
