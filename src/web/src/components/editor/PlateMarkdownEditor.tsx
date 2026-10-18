'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
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
import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
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
 * Markdown in, markdown out: a bordered field with a toolbar and markdown shortcuts as you type
 * ("# ", "> ", "**bold**"). Long documents use the Plate UI DocumentEditor instead.
 */
export function PlateMarkdownEditor({
  value,
  onChange,
  placeholder = 'Write here…',
  header,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  header?: ReactNode;
}) {
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
