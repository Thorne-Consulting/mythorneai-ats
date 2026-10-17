'use client';

import './plate.css';

import { type ReactNode, useMemo } from 'react';

import type { Value } from 'platejs';

import { deserializeMd, MarkdownPlugin, serializeMd } from '@platejs/markdown';
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  QuoteIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS, TrailingBlockPlugin } from 'platejs';
import {
  BlockPlaceholderPlugin,
  Plate,
  createPlatePlugin,
  useEditorRef,
  useEditorSelector,
  usePlateEditor,
} from 'platejs/react';
import remarkGfm from 'remark-gfm';

import { BasicBlocksKit } from './editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from './editor/plugins/basic-marks-kit';
import { BlockSelectionKit, DndKit } from './editor/plugins/dnd-kit';
import { SlashKit, TemplateKit } from './editor/plugins/menu-kit';
import { TableKit } from './editor/plugins/table-kit';
import { Editor, EditorContainer } from './ui/editor';
import { FloatingToolbar } from './ui/floating-toolbar';
import { MarkToolbarButton } from './ui/mark-toolbar-button';
import { BASIC_BLOCKS, type EditorTemplate, fitTables, MenuItemsContext } from './ui/menu-node';
import { ToolbarButton, ToolbarSeparator } from './ui/toolbar';
import { TooltipProvider } from './ui/tooltip';

export type { EditorTemplate } from './ui/menu-node';

function BlockButtons() {
  return (
    <>
      <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘B)">
        <BoldIcon />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘I)">
        <ItalicIcon />
      </MarkToolbarButton>
      <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘U)">
        <UnderlineIcon />
      </MarkToolbarButton>
      <ToolbarSeparator />
      <TurnInto type={KEYS.h1} tooltip="Heading 1" icon={<Heading1Icon />} />
      <TurnInto type={KEYS.h2} tooltip="Heading 2" icon={<Heading2Icon />} />
      <TurnInto type={KEYS.h3} tooltip="Heading 3" icon={<Heading3Icon />} />
      <TurnInto type={KEYS.blockquote} tooltip="Quote" icon={<QuoteIcon />} />
    </>
  );
}

function TurnInto({ type, tooltip, icon }: { type: string; tooltip: string; icon: ReactNode }) {
  const editor = useEditorRef();
  const active = useEditorSelector((ed) => ed.api.some({ match: { type } }), [type]);
  return (
    <ToolbarButton
      tooltip={tooltip}
      pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.tf.toggleBlock(type)}
    >
      {icon}
    </ToolbarButton>
  );
}

const emptyValue = (): Value => [{ type: 'p', children: [{ text: '' }] }];

/**
 * A Notion-style markdown page built on Plate's own UI kit. "/" on an empty line inserts a block,
 * "#" inserts a template (when there are any), and selected text gets a small format toolbar.
 */
export function DocumentEditor({
  value,
  onChange,
  templates = [],
  blocks = [],
  readOnly = false,
}: {
  value: string;
  onChange?: (markdown: string) => void;
  templates?: EditorTemplate[];
  /** Extra blocks for the / menu, after the basic ones (for example a scorecard table). */
  blocks?: EditorTemplate[];
  /** Show the document exactly as it will look, with nothing editable. */
  readOnly?: boolean;
}) {
  const editor = usePlateEditor({
    readOnly,
    plugins: [
      ...BasicBlocksKit,
      ...BasicMarksKit,
      ...TableKit,
      ...DndKit,
      ...BlockSelectionKit,
      // Keeps an empty line at the end, so there is always somewhere to type after a table and
      // deleting every block leaves an empty page rather than nothing.
      TrailingBlockPlugin,
      ...SlashKit,
      ...(templates.length ? TemplateKit : []),
      MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
      BlockPlaceholderPlugin.configure({
        options: {
          className:
            'before:absolute before:cursor-text before:text-muted-foreground/70 before:content-[attr(placeholder)]',
          placeholders: {
            [KEYS.p]: templates.length
              ? 'Type # for a template, / for a block'
              : 'Type / for a block',
          },
          query: ({ path }) => path.length === 1,
        },
      }),
      createPlatePlugin({
        key: 'floating-toolbar',
        render: {
          afterEditable: () => (
            <FloatingToolbar>
              <BlockButtons />
            </FloatingToolbar>
          ),
        },
      }),
    ],
    value: (instance) => (value.trim() ? fitTables(deserializeMd(instance, value)) : emptyValue()),
  });

  const items = useMemo(
    () => ({ blocks: [...BASIC_BLOCKS, ...blocks], templates }),
    [blocks, templates],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <MenuItemsContext.Provider value={items}>
        <Plate
          editor={editor}
          onValueChange={({ value: next }) => onChange?.(serializeMd(editor, { value: next }))}
        >
          <EditorContainer variant="default" className="plate-ui overflow-visible">
            <Editor
              variant="none"
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
    </TooltipProvider>
  );
}
