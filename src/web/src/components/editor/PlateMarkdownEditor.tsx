'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { Value } from 'platejs';
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

function Quote(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      style={{ borderLeft: '2px solid var(--mantine-color-indigo-5)', paddingLeft: 16, margin: 0 }}
      {...props}
    />
  );
}

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
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      H1Plugin.withComponent((props) => <Heading as="h1" {...props} />),
      H2Plugin.withComponent((props) => <Heading as="h2" {...props} />),
      H3Plugin.withComponent((props) => <Heading as="h3" {...props} />),
      BlockquotePlugin.withComponent(Quote),
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
      <Plate
        editor={editor}
        onChange={({ value: nextValue }) => onChange(serializeMd(editor, { value: nextValue }))}
      >
        <PlateContent
          placeholder={placeholder}
          style={{ minHeight: 240, padding: '18px 20px', outline: 'none' }}
        />
      </Plate>
    </Paper>
  );
}
