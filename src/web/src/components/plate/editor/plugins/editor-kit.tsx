'use client';

import { deserializeMd } from '@platejs/markdown';
import { type SlateEditor, type Value, normalizeStaticValue } from 'platejs';

import { BasicBlocksKit } from './basic-blocks-kit';
import { BasicMarksKit } from './basic-marks-kit';
import { EmojiKit } from './emoji-kit';
import { LinkKit } from './link-kit';
import { IndentKit, ListKit } from './list-kit';
import { MarkdownKit } from './markdown-kit';
import { TableKit } from './table-kit';

export { chipKit, ChipItemsContext, type ChipItem, type ChipSets } from './chip-kit';
export { ImageKit } from './image-kit';

/**
 * The plugins every editor shares: headings, quotes, rules, code blocks ("```"), marks, lists
 * (with "- ", "1. " and "[] " shortcuts and Tab to nest), links, tables, ":" emoji and Markdown in
 * and out. The static twin for read views is `components/rich-text`. Add `chipKit(chips)` for "@"
 * and "{" chips, and `ImageKit` for pictures (on in both editors unless `images={false}`).
 */
export const EditorKit = [
  ...IndentKit,
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...LinkKit,
  ...TableKit,
  // After the table plugin, so Tab in a list nests it and Tab in a table still moves cells.
  ...ListKit,
  ...EmojiKit,
  ...MarkdownKit,
];

/**
 * Markdown to the editor's first value. Ids count up from 1 (`normalizeStaticValue`) instead of
 * being random, so the server-rendered editor and the browser's agree and React does not report a
 * hydration mismatch.
 */
export function initialValue(
  editor: SlateEditor,
  markdown: string,
  fit: (nodes: Value) => Value = (nodes) => nodes,
): Value {
  const nodes = markdown.trim()
    ? fit(deserializeMd(editor, markdown))
    : [{ type: 'p', children: [{ text: '' }] }];
  return normalizeStaticValue(nodes);
}
