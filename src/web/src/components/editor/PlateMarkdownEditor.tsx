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
import { deserializeMd, serializeMd } from '@platejs/markdown';
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
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconUnderline,
} from '@tabler/icons-react';

const emptyValue = (): Value => [{ type: 'p', children: [{ text: '' }] }];

/** A block of markdown offered from the "#" menu in document mode. */
export interface EditorTemplate {
  label: string;
  hint?: string;
  markdown: string;
}

// "#" alone or "#tech" on an empty paragraph opens the template menu. "# " (with a space) is
// left to the heading shortcut, which turns the line into a heading before this ever sees it.
const TEMPLATE_QUERY = /^#([a-z][a-z0-9 ]*)?$/i;

function Heading({ as, ...props }: PlateElementProps & { as: 'h1' | 'h2' | 'h3' }) {
  return <PlateElement as={as} {...props} />;
}

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
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  header?: ReactNode;
  variant?: 'boxed' | 'document';
  templates?: EditorTemplate[];
}) {
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  const [menu, setMenu] = useState<{
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

  const matches = menu
    ? templates.filter((item) => item.label.toLowerCase().includes(menu.query.toLowerCase()))
    : [];

  // Look at the line the caret is on and open, update or close the template menu.
  const syncMenu = () => {
    const entry = editor.api.block();
    const text = entry ? editor.api.string(entry[1]) : '';
    const match = entry && entry[0].type === 'p' ? TEMPLATE_QUERY.exec(text) : null;
    if (!templates.length || !match || !editor.selection) {
      setMenu(null);
      return;
    }
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    setMenu((current) => ({
      query: match[1] ?? '',
      top: (rect?.bottom ?? 0) + 6,
      left: rect?.left ?? 0,
      index: current && current.query === (match[1] ?? '') ? current.index : 0,
    }));
  };

  const applyTemplate = (template: EditorTemplate) => {
    const entry = editor.api.block();
    if (!entry) return;
    const [, path] = entry;
    const nodes = deserializeMd(editor, template.markdown);
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
          }}
          onSelectionChange={() => {
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
            placeholder={placeholder}
            className="doc-editor-content"
            onBlur={() => {
              setBubble(null);
              setMenu(null);
            }}
            onKeyDown={(event) => {
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
        {menu && matches.length > 0 && (
          <Paper
            className="doc-editor-menu"
            shadow="md"
            radius="md"
            style={{ top: menu.top, left: menu.left }}
            role="listbox"
            aria-label="Templates"
          >
            <Text size="xs" c="dimmed" px={10} pt={6} pb={4}>
              Templates
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
