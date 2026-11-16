'use client';

import * as React from 'react';

import type { TComboboxInputElement } from 'platejs';

import { KEYS } from 'platejs';
import { type PlateElementProps, PlateElement, useFocused, useSelected } from 'platejs/react';

import { cn } from '@/components/plate/lib/utils';

import { type TChipElement, chipClass, chipText } from './chip-node-static';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

/** Something a chip can point at: a person (`key` = email) or a detail (`key` = `firstName`). */
export type ChipItem = { key: string; text: string; group?: string };

/** What the "@" and "{" menus offer. Set by the editor from its `chips` prop. */
export type ChipSets = { people?: ChipItem[]; details?: ChipItem[] };

export const ChipItemsContext = React.createContext<ChipSets>({});

const listFor = (sets: ChipSets, trigger?: string) =>
  (trigger === '{' ? sets.details : sets.people) ?? [];

export function ChipElement(props: PlateElementProps<TChipElement>) {
  const sets = React.useContext(ChipItemsContext);
  const selected = useSelected();
  const focused = useFocused();
  const element = props.element;
  const label = listFor(sets, element.trigger).find((item) => item.key === element.key)?.text;
  return (
    <PlateElement
      {...props}
      as="span"
      className={cn(chipClass(element), selected && focused && 'rounded-sm ring-2 ring-ring')}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
      }}
    >
      {chipText(element, label)}
      {props.children}
    </PlateElement>
  );
}

// "{{first" should still find "First name".
const filter = (item: { value: string; label?: string; group?: string }, search: string) => {
  const query = search.replace(/^\{+/, '').trim().toLowerCase();
  return (
    !query || [item.label, item.value, item.group].some((s) => s?.toLowerCase().includes(query))
  );
};

export function ChipInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;
  const sets = React.useContext(ChipItemsContext);
  const trigger = element.trigger === '{' ? '{' : '@';
  const items = listFor(sets, trigger);
  const groups = [...new Set(items.map((item) => item.group ?? ''))];

  const insert = (item: ChipItem) => {
    editor.tf.insertNodes({
      type: editor.getType(KEYS.mention),
      key: item.key,
      value: item.text,
      trigger,
      children: [{ text: '' }],
    });
    editor.tf.move({ unit: 'offset' });
  };

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger={trigger} filter={filter}>
        <span className="rounded-sm bg-accent px-1 text-accent-foreground">
          <InlineComboboxInput />
        </span>
        <InlineComboboxContent>
          <InlineComboboxEmpty>
            {trigger === '{' ? 'No detail matches' : 'Nobody matches'}
          </InlineComboboxEmpty>
          {groups.map((group) => (
            <InlineComboboxGroup key={group}>
              {group && <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>}
              {items
                .filter((item) => (item.group ?? '') === group)
                .map((item) => (
                  <InlineComboboxItem
                    key={item.key}
                    value={item.key}
                    label={item.text}
                    group={item.group}
                    onClick={() => insert(item)}
                  >
                    {item.text}
                  </InlineComboboxItem>
                ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}
