'use client';

import { useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLocalStorageState } from '@/lib/hooks';

export type SavedView<S> = { id: string; name: string; state: S; builtIn?: boolean };

/**
 * A row of named filter presets. Built-in views come from the page; the user can save the current
 * filters as a new view (kept in this browser) and delete their own.
 */
export function SavedViews<S>({
  storageKey,
  builtIn,
  current,
  activeId,
  onApply,
}: {
  storageKey: string;
  builtIn: SavedView<S>[];
  current: S;
  activeId: string | null;
  onApply: (view: SavedView<S>) => void;
}) {
  const [mine, setMine] = useLocalStorageState<SavedView<S>[]>(`ats-views:${storageKey}`, []);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const views = [...builtIn, ...mine];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span key={v.id} className="group relative">
          <button
            type="button"
            onClick={() => onApply(v)}
            aria-pressed={v.id === activeId}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
              v.id === activeId && 'border-primary/40 bg-accent font-medium text-accent-foreground',
              !v.builtIn && 'pr-7',
            )}
          >
            {!v.builtIn && <Bookmark className="size-3.5" aria-hidden />}
            {v.name}
          </button>
          {!v.builtIn && (
            <button
              type="button"
              aria-label={`Delete view ${v.name}`}
              onClick={() => setMine((m) => m.filter((x) => x.id !== v.id))}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-0.5 text-fg-subtle hover:bg-secondary hover:text-fg"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="quiet" size="sm" leftIcon={<Plus />}>
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const view = { id: `v-${Date.now()}`, name: name.trim(), state: current };
              setMine((m) => [...m, view]);
              onApply(view);
              setName('');
              setOpen(false);
            }}
            className="space-y-3"
          >
            <Input
              label="View name"
              placeholder="e.g. Senior engineers in review"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoFocus
            />
            <p className="text-xs text-fg-subtle">Saves the current filters in this browser.</p>
            <Button type="submit" fullWidth disabled={!name.trim()}>
              Save view
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
