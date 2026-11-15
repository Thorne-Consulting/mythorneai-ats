'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, CardHeader, SkeletonRows } from '@/components/ui';

/** Local editable copy of server data; resets whenever the server copy changes. */
export function useDraft<T>(source: T) {
  const serialized = JSON.stringify(source);
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    setDraft(JSON.parse(serialized) as T);
  }, [serialized]);
  return {
    draft,
    set: (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch })),
    replace: setDraft,
    dirty: JSON.stringify(draft) !== serialized,
    reset: () => setDraft(JSON.parse(serialized) as T),
  };
}

/**
 * One settings group in a card. With `onSave`, a sticky "Discard / Save changes" pair appears at
 * the bottom of the card once something changed.
 */
export function SettingsSection({
  id,
  title,
  description,
  action,
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel = 'Save changes',
  children,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id}>
      <section aria-labelledby={id ? `${id}-title` : undefined}>
        <CardHeader
          title={<span id={id ? `${id}-title` : undefined}>{title}</span>}
          description={description}
          action={action}
        />
        <div className="border-t border-border-subtle px-5 py-5">{children}</div>
        {/* Only while there is something to save, so a settled card carries no empty bar. */}
        {onSave && dirty && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border-subtle bg-card px-5 py-3">
            <Badge tone="amber" className="mr-auto">
              Unsaved changes
            </Badge>
            {onDiscard && (
              <Button variant="secondary" onClick={onDiscard} disabled={saving}>
                Discard
              </Button>
            )}
            <Button onClick={onSave} loading={saving}>
              {saveLabel}
            </Button>
          </div>
        )}
      </section>
    </Card>
  );
}

/** Loading placeholder for a settings card. */
export function SettingsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <SkeletonRows rows={rows} />
    </Card>
  );
}
