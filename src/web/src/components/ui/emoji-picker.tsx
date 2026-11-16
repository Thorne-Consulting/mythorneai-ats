'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Smile } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { IconButton, type ButtonSize } from './button';
import { SearchInput } from './input';
import { cn } from '@/lib/cn';

type EmojiData = {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<
    string,
    { id: string; name: string; keywords: string[]; skins: { native: string }[] }
  >;
};

const categoryLabels: Record<string, string> = {
  people: 'Smileys and people',
  nature: 'Animals and nature',
  foods: 'Food and drink',
  activity: 'Activities',
  places: 'Travel and places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

// Loaded on first open (about 430 KB), then kept for the session.
let cached: Promise<EmojiData> | null = null;
const loadEmoji = () =>
  (cached ??= import('@emoji-mart/data').then((m) => (m.default ?? m) as unknown as EmojiData));

/**
 * An emoji button that opens a searchable picker. `onPick` gets the emoji as text, so it works
 * with any textarea or input. Plain Unicode, no images.
 */
export function EmojiPicker({
  onPick,
  label = 'Add emoji',
  size = 'sm',
  trigger,
}: {
  onPick: (emoji: string) => void;
  label?: string;
  size?: ButtonSize;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EmojiData | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open && !data) loadEmoji().then(setData);
  }, [open, data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (term)
      return [
        {
          id: 'results',
          emojis: Object.values(data.emojis)
            .filter(
              (e) =>
                e.name.toLowerCase().includes(term) || e.keywords.some((k) => k.startsWith(term)),
            )
            .slice(0, 120),
        },
      ];
    return data.categories.map((c) => ({
      id: c.id,
      emojis: c.emojis.map((id) => data.emojis[id]).filter(Boolean),
    }));
  }, [data, q]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ('');
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <IconButton type="button" label={label} variant="quiet" size={size}>
            <Smile />
          </IconButton>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(340px,calc(100vw-2rem))] p-0">
        <div className="border-b border-border-subtle p-2">
          <SearchInput value={q} onValueChange={setQ} placeholder="Search emoji" autoFocus />
        </div>
        <div className="h-64 overflow-y-auto p-2" role="listbox" aria-label="Emoji">
          {!data ? (
            <p className="p-4 text-center text-sm text-fg-subtle">Loading emoji…</p>
          ) : groups.every((g) => g.emojis.length === 0) ? (
            <p className="p-4 text-center text-sm text-fg-subtle">No emoji match “{q}”.</p>
          ) : (
            groups.map((g) => (
              <section key={g.id} aria-label={categoryLabels[g.id] ?? 'Results'}>
                {g.id !== 'results' && (
                  <h3 className="sticky top-0 bg-popover px-1 pt-1 pb-1.5 text-2xs font-medium text-fg-subtle">
                    {categoryLabels[g.id] ?? g.id}
                  </h3>
                )}
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emojis.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      title={e.name}
                      aria-label={e.name}
                      onClick={() => {
                        onPick(e.skins[0].native);
                        setOpen(false);
                        setQ('');
                      }}
                      className={cn(
                        'flex aspect-square items-center justify-center rounded-md text-xl hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      )}
                    >
                      {e.skins[0].native}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Put `text` into a textarea or input at the cursor and return the new value and cursor spot. */
export function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  value: string,
  text: string,
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + text.length };
}
