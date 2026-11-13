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
import { Bold, Heading1, Heading2, Heading3, Italic, TextQuote, Underline } from 'lucide-react';
import { IconButton } from '@/components/ui';

const emptyValue = (): Value => [{ type: 'p', children: [{ text: '' }] }];

function Heading({ as, ...props }: PlateElementProps & { as: 'h1' | 'h2' | 'h3' }) {
  return <PlateElement as={as} {...props} />;
}

function TableElement({ children, ...props }: PlateElementProps) {
  return (
    <PlateElement
      as="table"
      className="my-3 w-full border-collapse text-sm [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium"
      {...props}
    >
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
      className="border-l-2 border-primary pl-4 text-fg-muted"
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
        ['Bold', Bold, () => editor.tf.bold.toggle()],
        ['Italic', Italic, () => editor.tf.italic.toggle()],
        ['Underline', Underline, () => editor.tf.underline.toggle()],
        ['Heading 1', Heading1, () => editor.tf.h1.toggle()],
        ['Heading 2', Heading2, () => editor.tf.h2.toggle()],
        ['Heading 3', Heading3, () => editor.tf.h3.toggle()],
        ['Quote', TextQuote, () => editor.tf.blockquote.toggle()],
      ] as const,
    [editor],
  );

  const save = (nextValue: Value) => onChange(serializeMd(editor, { value: nextValue }));

  return (
    <div className="overflow-hidden rounded-md border border-input bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle p-2">
        <div className="flex gap-1">
          {toolbar.map(([label, Icon, action]) => (
            <IconButton
              key={label}
              label={label}
              variant="quiet"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
            >
              <Icon />
            </IconButton>
          ))}
        </div>
        {header}
      </div>
      <Plate editor={editor} onChange={({ value: nextValue }) => save(nextValue)}>
        <PlateContent
          placeholder={placeholder}
          className="min-h-60 px-5 py-4 text-base text-fg outline-none [&_h1]:mt-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-1"
        />
      </Plate>
    </div>
  );
}
