'use client';

import { useMemo } from 'react';

import { serializeMd } from '@platejs/markdown';
import { KEYS, TrailingBlockPlugin } from 'platejs';
import { BlockPlaceholderPlugin, Plate, createPlatePlugin, usePlateEditor } from 'platejs/react';

import { BlockSelectionKit, DndKit } from './editor/plugins/dnd-kit';
import {
  type ChipSets,
  ChipItemsContext,
  chipKit,
  EditorKit,
  ImageKit,
  initialValue,
} from './editor/plugins/editor-kit';
import { SlashKit, TemplateKit } from './editor/plugins/menu-kit';
import { Editor, EditorContainer } from './ui/editor';
import { FloatingToolbar } from './ui/floating-toolbar';
import { FormatButtons } from './ui/format-buttons';
import { BASIC_BLOCKS, type EditorTemplate, fitTables, MenuItemsContext } from './ui/menu-node';
import { TooltipProvider } from './ui/tooltip';

export type { EditorTemplate } from './ui/menu-node';
export type { ChipItem, ChipSets } from './editor/plugins/editor-kit';

/**
 * A Notion-style markdown page built on Plate's own UI kit. "/" on an empty line inserts a block
 * (code block and picture among them), "#" inserts a template (when there are any), and selected
 * text gets a small format toolbar. Pictures can also be pasted or dropped in.
 */
export function DocumentEditor({
  value,
  onChange,
  templates = [],
  blocks = [],
  readOnly = false,
  chips,
  images = true,
}: {
  value: string;
  onChange?: (markdown: string) => void;
  templates?: EditorTemplate[];
  /** Extra blocks for the / menu, after the basic ones (for example a scorecard table). */
  blocks?: EditorTemplate[];
  /** Show the document exactly as it will look, with nothing editable. */
  readOnly?: boolean;
  /** "@" for people and "{" for details such as First name. */
  chips?: ChipSets;
  /** Pictures: "/" then Picture, paste or drop. On unless turned off. */
  images?: boolean;
}) {
  const hint = templates.length ? 'Type # for a template, / for a block' : 'Type / for a block';
  const editor = usePlateEditor({
    readOnly,
    plugins: [
      ...EditorKit,
      ...(images ? ImageKit : []),
      ...chipKit(chips),
      ...DndKit,
      ...BlockSelectionKit,
      // Keeps an empty line at the end, so there is always somewhere to type after a table and
      // deleting every block leaves an empty page rather than nothing.
      TrailingBlockPlugin,
      ...SlashKit,
      ...(templates.length ? TemplateKit : []),
      BlockPlaceholderPlugin.configure({
        options: {
          className:
            'before:absolute before:cursor-text before:text-muted-foreground/70 before:content-[attr(placeholder)]',
          placeholders: {
            [KEYS.p]: hint,
          },
          // An empty page shows the editor's own placeholder instead, focused or not.
          query: ({ editor, path }) => path.length === 1 && !editor.api.isEmpty(),
        },
      }),
      createPlatePlugin({
        key: 'floating-toolbar',
        render: {
          afterEditable: () => (
            <FloatingToolbar>
              <FormatButtons emoji={false} inserts={false} />
            </FloatingToolbar>
          ),
        },
      }),
    ],
    value: (instance) => initialValue(instance, value, fitTables),
  });

  const items = useMemo(
    () => ({ blocks: [...BASIC_BLOCKS, ...blocks], templates }),
    [blocks, templates],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <ChipItemsContext.Provider value={chips ?? {}}>
        <MenuItemsContext.Provider value={items}>
          <Plate
            editor={editor}
            onValueChange={({ value: next }) => onChange?.(serializeMd(editor, { value: next }))}
          >
            <EditorContainer variant="default" className="plate-ui overflow-visible">
              <Editor
                variant="none"
                placeholder={readOnly ? undefined : hint}
                className="min-h-[50vh] text-base"
                onKeyDown={(event) => {
                  // Tab in the last cell of a table adds a row, the way Notion and Docs do.
                  if (event.key !== 'Tab' || event.shiftKey) return;
                  const table = editor.api.above({ match: { type: KEYS.table } });
                  const row = editor.api.above({ match: { type: KEYS.tr } });
                  const cell = editor.api.above({ match: { type: [KEYS.td, KEYS.th] } });
                  if (!table || !row || !cell) return;
                  const lastRow = row[1].at(-1) === table[0].children.length - 1;
                  const lastCell = cell[1].at(-1) === row[0].children.length - 1;
                  if (lastRow && lastCell) {
                    event.preventDefault();
                    editor.tf.insert.tableRow({ select: true });
                  }
                }}
              />
            </EditorContainer>
          </Plate>
        </MenuItemsContext.Provider>
      </ChipItemsContext.Provider>
    </TooltipProvider>
  );
}
