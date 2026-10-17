'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { Value } from 'platejs';
import {
  BlockquoteRules,
  BoldRules,
  HeadingRules,
  ItalicRules,
  UnderlineRules,
} from '@platejs/basic-nodes';
import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import { deserializeMd, MarkdownPlugin, serializeMd } from '@platejs/markdown';
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from '@platejs/table/react';
import remarkGfm from 'remark-gfm';
import {
  Plate,
  PlateContent,
  PlateElement,
  usePlateEditor,
  type PlateElementProps,
} from 'platejs/react';
import { ActionIcon, Group, Paper, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconBlockquote,
  IconBold,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTableOff,
  IconUnderline,
} from '@tabler/icons-react';

const emptyValue = (): Value => [{ type: 'p', children: [{ text: '' }] }];

/** Something the menu can insert: a block of markdown, or an empty block of one type. */
export interface EditorTemplate {
  label: string;
  hint?: string;
  markdown?: string;
  block?: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
}

// On an empty line, "/" opens the block commands and "#" opens the templates. Typing after either
// filters the list. "# " (with a space) is left to the heading shortcut instead.
const MENU_QUERY = /^([#/])([a-z][a-z0-9 ]*)?$/i;

const BLOCKS: EditorTemplate[] = [
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

function Heading({ as, ...props }: PlateElementProps & { as: 'h1' | 'h2' | 'h3' }) {
  return <PlateElement as={as} {...props} />;
}

function TableElement({ children, ...props }: PlateElementProps) {
  return (
    <PlateElement as="table" className="doc-table" {...props}>
      <tbody>{children}</tbody>
    </PlateElement>
  );
}

const TableRow = (props: PlateElementProps) => <PlateElement as="tr" {...props} />;
const TableCell = (props: PlateElementProps) => <PlateElement as="td" {...props} />;
const TableHeaderCell = (props: PlateElementProps) => <PlateElement as="th" {...props} />;

function Quote(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      style={{ borderLeft: '2px solid var(--mantine-color-indigo-5)', paddingLeft: 16, margin: 0 }}
      {...props}
    />
  );
}

/**
 * Markdown in, markdown out. `boxed` is a bordered field with a toolbar; `document` is a
 * borderless, Notion-style page: markdown shortcuts as you type ("# ", "> ", "**bold**") and a
 * small toolbar that appears over selected text.
 */
export function PlateMarkdownEditor({
  value,
  onChange,
  placeholder = 'Write here…',
  header,
  variant = 'boxed',
  templates = [],
  readOnly = false,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  header?: ReactNode;
  variant?: 'boxed' | 'document';
  templates?: EditorTemplate[];
  /** Show the document exactly as it will look, with nothing editable. */
  readOnly?: boolean;
}) {
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  // Where the table toolbar sits, relative to the editor, while the caret is in a table.
  const [tableBar, setTableBar] = useState<{ top: number; right: number } | null>(null);
  const [menu, setMenu] = useState<{
    trigger: '#' | '/';
    query: string;
    top: number;
    left: number;
    index: number;
  } | null>(null);
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin.configure({ inputRules: [BoldRules.markdown({ variant: '*' })] }),
      ItalicPlugin.configure({ inputRules: [ItalicRules.markdown({ variant: '_' })] }),
      UnderlinePlugin.configure({ inputRules: [UnderlineRules.markdown()] }),
      H1Plugin.withComponent((props) => <Heading as="h1" {...props} />).configure({
        inputRules: [HeadingRules.markdown()],
      }),
      H2Plugin.withComponent((props) => <Heading as="h2" {...props} />).configure({
        inputRules: [HeadingRules.markdown()],
      }),
      H3Plugin.withComponent((props) => <Heading as="h3" {...props} />).configure({
        inputRules: [HeadingRules.markdown()],
      }),
      BlockquotePlugin.withComponent(Quote).configure({
        inputRules: [BlockquoteRules.markdown()],
      }),
      TablePlugin.withComponent(TableElement),
      TableRowPlugin.withComponent(TableRow),
      TableCellPlugin.withComponent(TableCell),
      TableCellHeaderPlugin.withComponent(TableHeaderCell),
      MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
    ],
    value: (instance) => (value.trim() ? deserializeMd(instance, value) : emptyValue()),
  });

  const toolbar = useMemo(
    () =>
      [
        ['Bold', IconBold, () => editor.tf.bold.toggle()],
        ['Italic', IconItalic, () => editor.tf.italic.toggle()],
        ['Underline', IconUnderline, () => editor.tf.underline.toggle()],
        ['Heading 1', IconH1, () => editor.tf.h1.toggle()],
        ['Heading 2', IconH2, () => editor.tf.h2.toggle()],
        ['Heading 3', IconH3, () => editor.tf.h3.toggle()],
        ['Quote', IconBlockquote, () => editor.tf.blockquote.toggle()],
      ] as const,
    [editor],
  );

  const save = (nextValue: Value) => onChange(serializeMd(editor, { value: nextValue }));

  const tableActions = [
    [
      'Row above',
      IconRowInsertTop,
      () => editor.tf.insert.tableRow({ before: true, select: true }),
    ],
    ['Row below', IconRowInsertBottom, () => editor.tf.insert.tableRow({ select: true })],
    ['Delete row', IconRowRemove, () => editor.tf.remove.tableRow()],
    [
      'Column left',
      IconColumnInsertLeft,
      () => editor.tf.insert.tableColumn({ before: true, select: true }),
    ],
    ['Column right', IconColumnInsertRight, () => editor.tf.insert.tableColumn({ select: true })],
    ['Delete column', IconColumnRemove, () => editor.tf.remove.tableColumn()],
    ['Delete table', IconTableOff, () => editor.tf.remove.table()],
  ] as const;

  // Keep the table toolbar pinned just above whichever table holds the caret.
  const syncTableBar = () => {
    const table = readOnly ? undefined : editor.api.above({ match: { type: 'table' } });
    const tableNode = table ? editor.api.toDOMNode(table[0]) : undefined;
    const container = tableNode?.closest('.doc-editor');
    if (!tableNode || !container) {
      setTableBar(null);
      return;
    }
    const tableRect = tableNode.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    // Right-aligned, so the section heading on the left stays readable.
    setTableBar({ top: tableRect.top - boxRect.top - 40, right: boxRect.right - tableRect.right });
  };

  const matches = menu
    ? (menu.trigger === '/' ? BLOCKS : templates).filter((item) =>
        item.label.toLowerCase().includes(menu.query.toLowerCase()),
      )
    : [];

  // Look at the line the caret is on and open, update or close the template menu.
  const syncMenu = () => {
    const entry = editor.api.block();
    const text = entry ? editor.api.string(entry[1]) : '';
    const match = entry && entry[0].type === 'p' ? MENU_QUERY.exec(text) : null;
    const trigger = match?.[1] as '#' | '/' | undefined;
    if (!match || !trigger || !editor.selection || (trigger === '#' && !templates.length)) {
      setMenu(null);
      return;
    }
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const query = match[2] ?? '';
    setMenu((current) => ({
      trigger,
      query,
      top: (rect?.bottom ?? 0) + 6,
      left: rect?.left ?? 0,
      index: current && current.query === query ? current.index : 0,
    }));
  };

  const applyTemplate = (template: EditorTemplate) => {
    const entry = editor.api.block();
    if (!entry) return;
    const [, path] = entry;
    const nodes = template.block
      ? [{ type: template.block, children: [{ text: '' }] }]
      : deserializeMd(editor, template.markdown ?? '');
    editor.tf.insertNodes(nodes, { at: path, select: true });
    editor.tf.removeNodes({ at: [path[0] + nodes.length] });
    setMenu(null);
  };

  if (variant === 'document') {
    return (
      <div className="doc-editor">
        <Plate
          editor={editor}
          onChange={({ value: nextValue }) => {
            save(nextValue);
            syncMenu();
            syncTableBar();
          }}
          onSelectionChange={() => {
            syncTableBar();
            // Show the toolbar just above a non-empty selection, hide it otherwise.
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
              setBubble(null);
              return;
            }
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            setBubble({ top: rect.top - 44, left: rect.left + rect.width / 2 });
          }}
        >
          <PlateContent
            readOnly={readOnly}
            placeholder={placeholder}
            className="doc-editor-content"
            onBlur={() => {
              setBubble(null);
              setMenu(null);
              setTableBar(null);
            }}
            onKeyDown={(event) => {
              // Tab in the last cell of a table adds a row, the way Notion and Docs do.
              if (event.key === 'Tab' && !event.shiftKey && !menu) {
                const table = editor.api.above({ match: { type: 'table' } });
                const row = editor.api.above({ match: { type: 'tr' } });
                const cell = editor.api.above({ match: { type: ['td', 'th'] } });
                if (table && row && cell) {
                  const rowIndex = row[1][row[1].length - 1];
                  const cellIndex = cell[1][cell[1].length - 1];
                  const lastRow = rowIndex === table[0].children.length - 1;
                  const lastCell = cellIndex === row[0].children.length - 1;
                  if (lastRow && lastCell) {
                    event.preventDefault();
                    editor.tf.insert.tableRow({ select: true });
                    return;
                  }
                }
              }
              if (!menu || matches.length === 0) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setMenu({
                  ...menu,
                  index: (menu.index + step + matches.length) % matches.length,
                });
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                applyTemplate(matches[menu.index] ?? matches[0]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setMenu(null);
              }
            }}
          />
        </Plate>
        {/* The empty-page placeholder says the same thing, so only show this once there's text. */}
        {!readOnly && value.trim() !== '' && (
          <p className="doc-editor-hint">
            {templates.length > 0 && (
              <>
                <kbd>#</kbd> templates
                <span aria-hidden> · </span>
              </>
            )}
            <kbd>/</kbd> blocks, on an empty line
          </p>
        )}
        {tableBar && (
          <Paper
            className="doc-table-bar"
            shadow="sm"
            radius="md"
            style={{ top: tableBar.top, right: tableBar.right }}
            role="toolbar"
            aria-label="Table"
          >
            {tableActions.map(([label, Icon, action], index) => (
              <Tooltip label={label} key={label} openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color={label === 'Delete table' ? 'red' : 'gray'}
                  aria-label={label}
                  data-gap={index === 3 || index === 6 || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    action();
                    requestAnimationFrame(syncTableBar);
                  }}
                >
                  <Icon size={16} />
                </ActionIcon>
              </Tooltip>
            ))}
          </Paper>
        )}
        {menu && matches.length > 0 && (
          <Paper
            className="doc-editor-menu"
            shadow="md"
            radius="md"
            style={{ top: menu.top, left: menu.left }}
            role="listbox"
            aria-label={menu.trigger === '/' ? 'Blocks' : 'Templates'}
          >
            <Text size="xs" c="dimmed" px={10} pt={6} pb={4}>
              {menu.trigger === '/' ? 'Blocks' : 'Templates'}
            </Text>
            {matches.map((item, index) => (
              <UnstyledButton
                key={item.label}
                role="option"
                aria-selected={index === menu.index}
                data-active={index === menu.index || undefined}
                className="doc-editor-menu-item"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setMenu({ ...menu, index })}
                onClick={() => applyTemplate(item)}
              >
                <span className="doc-editor-menu-label">{item.label}</span>
                {item.hint && <span className="doc-editor-menu-hint">{item.hint}</span>}
              </UnstyledButton>
            ))}
          </Paper>
        )}
        {bubble && (
          <Paper
            className="doc-editor-bubble"
            shadow="md"
            radius="md"
            style={{ top: bubble.top, left: bubble.left }}
            role="toolbar"
            aria-label="Format selected text"
          >
            {toolbar.map(([label, Icon, action]) => (
              <Tooltip label={label} key={label} openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={action}
                >
                  <Icon size={16} />
                </ActionIcon>
              </Tooltip>
            ))}
          </Paper>
        )}
      </div>
    );
  }

  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group
        justify="space-between"
        gap="xs"
        p="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Group gap={4}>
          {toolbar.map(([label, Icon, action]) => (
            <Tooltip label={label} key={label}>
              <ActionIcon
                variant="subtle"
                aria-label={label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={action}
              >
                <Icon size={16} />
              </ActionIcon>
            </Tooltip>
          ))}
        </Group>
        {header}
      </Group>
      <Plate editor={editor} onChange={({ value: nextValue }) => save(nextValue)}>
        <PlateContent
          placeholder={placeholder}
          style={{ minHeight: 240, padding: '18px 20px', outline: 'none' }}
        />
      </Plate>
    </Paper>
  );
}
