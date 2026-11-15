'use client';

import * as React from 'react';

import type { Emoji, EmojiMartData } from '@emoji-mart/data';

import { EmojiInlineIndexSearch } from '@platejs/emoji';
import { EmojiPlugin } from '@platejs/emoji/react';
import { SmileIcon } from 'lucide-react';
import { type PlateElementProps, PlateElement, useEditorRef, usePluginOption } from 'platejs/react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useDebouncedValue } from '@/lib/hooks';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';
import { ToolbarButton } from './toolbar';

const search = (data: EmojiMartData, query: string) =>
  EmojiInlineIndexSearch.getInstance(data).search(query).get() as Emoji[];

/** ":" then two letters, for example ":ta" for 🎉 tada. */
export function EmojiInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;
  const data = usePluginOption(EmojiPlugin, 'data') as EmojiMartData;
  const [value, setValue] = React.useState('');
  const query = useDebouncedValue(value, 100).replace(/:$/, '');
  const found = React.useMemo(
    () => (query.trim().length >= 2 ? search(data, query) : []),
    [data, query],
  );

  return (
    <PlateElement as="span" {...props}>
      <InlineCombobox
        value={value}
        element={element}
        filter={false}
        setValue={setValue}
        trigger=":"
        hideWhenNoValue
      >
        <InlineComboboxInput />
        <InlineComboboxContent>
          {query.trim().length >= 2 && <InlineComboboxEmpty>No emoji matches</InlineComboboxEmpty>}
          <InlineComboboxGroup>
            {found.map((emoji) => (
              <InlineComboboxItem
                key={emoji.id}
                value={emoji.name}
                onClick={() => editor.tf.insertText(emoji.skins[0].native)}
              >
                <span className="mr-2 text-md">{emoji.skins[0].native}</span>
                {emoji.name}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>
      {children}
    </PlateElement>
  );
}

/** A small picker: a search box over a grid, smileys and people when the box is empty. */
export function EmojiToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef();
  const data = usePluginOption(EmojiPlugin, 'data') as EmojiMartData;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const emojis = React.useMemo(() => {
    if (query.trim()) return search(data, query.trim());
    const people = data.categories.find((category) => category.id === 'people');
    return (people?.emojis ?? []).slice(0, 72).map((id) => data.emojis[id]);
  }, [data, query]);

  const pick = (native: string) => {
    editor.tf.focus();
    editor.tf.insertText(native);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton {...props} tooltip="Emoji" onMouseDown={(event) => event.preventDefault()}>
          <SmileIcon />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(304px,calc(100vw-32px))] p-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="mb-2 h-8 w-full rounded-md border border-input bg-card px-2 text-base text-fg outline-none placeholder:text-fg-subtle focus:border-primary"
        />
        {emojis.length ? (
          <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
            {emojis.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                title={emoji.name}
                aria-label={emoji.name}
                onClick={() => pick(emoji.skins[0].native)}
                className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent"
              >
                {emoji.skins[0].native}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 py-3 text-sm text-fg-subtle">No emoji matches.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
