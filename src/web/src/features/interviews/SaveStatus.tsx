'use client';

import { Check, CloudOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { SaveState } from './interview-notes';

/** "Saving…", "Saved" or "Not saved, Try again" under an autosaving field. */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <p aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-xs text-fg-subtle">
      {state === 'saving' && (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Saving…
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="size-3.5 text-tone-green-dot" aria-hidden />
          Saved
        </>
      )}
      {state === 'error' && (
        <>
          <CloudOff className="size-3.5 text-tone-red-dot" aria-hidden />
          Not saved. Check your connection.
          <Button size="xs" variant="link" onClick={onRetry}>
            Try again
          </Button>
        </>
      )}
    </p>
  );
}
