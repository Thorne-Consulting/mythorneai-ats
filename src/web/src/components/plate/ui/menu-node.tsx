'use client';

import * as React from 'react';

import type { PlateEditor, PlateElementProps } from 'platejs/react';

import { deserializeMd } from '@platejs/markdown';
import { type TComboboxInputElement } from 'platejs';
import { PlateElement } from 'platejs/react';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

/** Something a menu can insert: a block of markdown, or an empty block of one type. */
export interface EditorTemplate {
  label: string;
  hint?: string;
  markdown?: string;
  block?: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
}

export const BASIC_BLOCKS: EditorTemplate[] = [
  { label: 'Text', hint: 'A plain paragraph', block: 'p' },
  { label: 'Heading 1', hint: 'The page title', block: 'h1' },
  { label: 'Heading 2', hint: 'A section', block: 'h2' },
  { label: 'Heading 3', hint: 'A sub-section', block: 'h3' },
  { label: 'Quote', hint: 'Set a passage apart', block: 'blockquote' },
  {
    label: 'Table',
    hint: 'Three columns; Tab in the last cell adds a row',
    markdown: '|   |   |   |\n| --- | --- | --- |\n|   |   |   |',
  },
];

/** What the / and # menus offer in this editor. Set by the editor that renders them. */
export const MenuItemsContext = React.createContext<{
  blocks: EditorTemplate[];
  templates: EditorTemplate[];
}>({ blocks: BASIC_BLOCKS, templates: [] });

// Markdown carries no column widths, and Plate falls back to 120px a column. Short columns (a
// "Weight" of 3) keep the width their text needs; the long ones share what is left of the page.
const PAGE_WIDTH = 860;
const SHORT_COLUMN = 160;

type Node = { type?: string; text?: string; children?: Node[]; colSizes?: number[] };

const textOf = (node: Node): string => node.text ?? (node.children ?? []).map(textOf).join('');

export function fitTables<T>(nodes: T[]): T[] {
  return nodes.map((item) => {
    const node = item as Node;
    if (node.type !== 'table' || node.colSizes?.length) return item;
    const rows = node.children ?? [];
    const columns = rows[0]?.children?.length ?? 0;
    // Roughly 9px a character plus cell padding.
    const natural = Array.from({ length: columns }, (_, col) => {
      const chars = Math.max(0, ...rows.map((row) => textOf(row.children?.[col] ?? {}).length));
      return Math.max(80, Math.min(chars, 40) * 9 + 32);
    });
    const long = natural.filter((width) => width >= SHORT_COLUMN);
    const fixed = natural.filter((width) => width < SHORT_COLUMN).reduce((a, b) => a + b, 0);
    const longTotal = long.reduce((a, b) => a + b, 0);
    const colSizes = long.length
      ? natural.map((width) =>
          width < SHORT_COLUMN ? width : Math.round((width / longTotal) * (PAGE_WIDTH - fixed)),
        )
      : natural.map(() => Math.floor(PAGE_WIDTH / columns));
    return { ...node, colSizes } as T;
  });
}

/** Swap the (now empty) line the menu was opened on for the chosen block or template. */
function insertItem(editor: PlateEditor, item: EditorTemplate) {
  const entry = editor.api.block();
  if (!entry) return;
  const [, path] = entry;
  if (item.block) {
    editor.tf.setNodes({ type: item.block }, { at: path });
    return;
  }
  const nodes = fitTables(deserializeMd(editor, item.markdown ?? ''));
  editor.tf.insertNodes(nodes, { at: path, select: true });
  editor.tf.removeNodes({ at: [path[0] + nodes.length] });
}

function MenuInput({
  editor,
  element,
  trigger,
  label,
  items,
  onValue,
}: {
  editor: PlateEditor;
  element: TComboboxInputElement;
  trigger: string;
  label: string;
  items: EditorTemplate[];
  onValue?: (value: string) => void;
}) {
  return (
    <InlineCombobox element={element} trigger={trigger} setValue={onValue}>
      <InlineComboboxInput />
      <InlineComboboxContent>
        <InlineComboboxEmpty>Nothing matches</InlineComboboxEmpty>
        <InlineComboboxGroup>
          <InlineComboboxGroupLabel>{label}</InlineComboboxGroupLabel>
          {items.map((item) => (
            <InlineComboboxItem
              key={item.label}
              value={item.label}
              label={item.label}
              className="h-auto flex-col items-start gap-0 py-1.5"
              onClick={() => insertItem(editor, item)}
            >
              <span>{item.label}</span>
              {item.hint && <span className="text-muted-foreground text-xs">{item.hint}</span>}
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      </InlineComboboxContent>
    </InlineCombobox>
  );
}

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { blocks } = React.useContext(MenuItemsContext);
  return (
    <PlateElement {...props} as="span">
      <MenuInput
        editor={props.editor}
        element={props.element}
        trigger="/"
        label="Blocks"
        items={blocks}
      />
      {props.children}
    </PlateElement>
  );
}

/**
 * "#" opens the templates. "# ", "## " and "### " still make headings: once the query is only
 * hashes and a space, the menu steps aside and the line becomes that heading.
 */
export function TemplateInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;
  const { templates } = React.useContext(MenuItemsContext);

  const onValue = (next: string) => {
    const heading = /^(#{0,2}) $/.exec(next);
    if (!heading) return;
    const path = editor.api.findPath(element);
    if (!path) return;
    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: path });
      editor.tf.setNodes({ type: `h${heading[1].length + 1}` }, { at: path.slice(0, -1) });
    });
    editor.tf.focus();
  };

  return (
    <PlateElement {...props} as="span">
      <MenuInput
        editor={editor}
        element={element}
        trigger="#"
        label="Templates"
        items={templates}
        onValue={onValue}
      />
      {props.children}
    </PlateElement>
  );
}
