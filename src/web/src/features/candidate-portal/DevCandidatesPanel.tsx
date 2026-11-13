'use client';

import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, LogIn, RotateCcw } from 'lucide-react';
import { Avatar, Badge, Button, Card, ConfirmDialog, toast } from '@/components/ui';
import { errorText, OFFLINE, postJson } from '@/features/careers/public-api';
import { writeToken } from './portal';

type LocalCandidate = { email: string; name: string; latest: string | null; applications: number };
type Listing = { code: string; candidates: LocalCandidate[] };

/**
 * Development only: the seeded @local.dev candidates with one-click sign-in and a reset back to
 * their starting state. Renders nothing in production builds or when the API is not in
 * Development (the endpoints are not mapped there).
 */
export function DevCandidatesPanel({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/public/dev/local-candidates');
      setListing(response.ok ? await response.json() : null);
    } catch {
      setListing(null);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (process.env.NODE_ENV !== 'development' || !listing) return null;

  async function signIn(email: string) {
    setBusy(email);
    try {
      await postJson('/public/portal/access-code', { email });
      const response = await fetch('/public/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: listing!.code }),
      });
      if (!response.ok) toast.error('Could not sign in', await errorText(response, 'Try again.'));
      else if (writeToken((await response.json()).token)) await onSignedIn();
    } catch (error) {
      toast.error('Could not sign in', error instanceof Error ? error.message : OFFLINE);
    }
    setBusy(null);
  }

  return (
    <Card className="mx-auto mt-6 max-w-md border-dashed border-tone-amber-dot/50 p-5">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-tone-amber-dot" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-fg">Local test candidates</h2>
            <Badge tone="amber" size="sm">
              Development only
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Every @local.dev email signs in with code{' '}
            <span className="font-mono font-medium text-fg">{listing.code}</span>. Reset puts them
            all back where they started.
          </p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-border-subtle">
        {listing.candidates.map((c) => (
          <li key={c.email} className="flex items-center gap-3 py-2.5">
            <Avatar name={c.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{c.name}</p>
              <p className="truncate text-xs text-fg-subtle">
                {c.email}
                {c.latest ? ` · ${c.latest}` : ''}
                {c.applications > 1 ? ` · ${c.applications} applications` : ''}
              </p>
            </div>
            <Button
              size="xs"
              variant="secondary"
              leftIcon={<LogIn />}
              loading={busy === c.email}
              disabled={busy !== null}
              onClick={() => signIn(c.email)}
              aria-label={`Sign in as ${c.name}`}
            >
              Sign in
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="quiet"
        size="sm"
        leftIcon={<RotateCcw />}
        className="mt-2"
        disabled={busy !== null}
        onClick={() => setConfirm(true)}
      >
        Reset test candidates
      </Button>
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title="Reset the local test candidates?"
        message="This deletes every @local.dev candidate and everything done with them, such as bookings, messages and scorecards. Then it creates them again as new."
        confirmLabel="Reset"
        onConfirm={async () => {
          try {
            await postJson('/public/dev/local-candidates/reset', {}, 'The reset did not work.');
            toast.success('Test candidates reset');
            await load();
          } catch (error) {
            toast.error('The reset did not work', error instanceof Error ? error.message : OFFLINE);
          }
        }}
      />
    </Card>
  );
}
