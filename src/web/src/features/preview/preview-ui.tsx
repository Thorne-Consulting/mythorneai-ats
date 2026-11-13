import { useState, type ReactNode } from 'react';
import { Alert, Badge } from '@/components/ui';

/** Page title with the amber Preview badge. Delete the badge when the screen gets a backend. */
export function PreviewTitle({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {children}
      <Badge tone="amber">Preview</Badge>
    </span>
  );
}

export function PreviewAlert({ children }: { children?: ReactNode }) {
  return (
    <Alert tone="info" className="mb-5">
      {children ??
        'This page uses sample data for now. Your changes are lost when you leave the page.'}
    </Alert>
  );
}

/** Row selection for the preview tables. Ids that disappear from the list drop out of the selection. */
export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selected = ids.filter((id) => picked.has(id));
  return {
    selected,
    has: (id: string) => picked.has(id),
    toggle: (id: string, on: boolean) =>
      setPicked((s) => {
        const next = new Set(s);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    allState: (selected.length > 0 && selected.length === ids.length
      ? true
      : selected.length
        ? 'indeterminate'
        : false) as boolean | 'indeterminate',
    toggleAll: (on: boolean) => setPicked(on ? new Set(ids) : new Set()),
    clear: () => setPicked(new Set()),
  };
}
