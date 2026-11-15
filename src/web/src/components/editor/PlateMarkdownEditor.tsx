'use client';

import type { ReactNode } from 'react';

import { serializeMd } from '@platejs/markdown';
import { normalizeStaticValue, SingleLinePlugin, type Value } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';

import {
  type ChipSets,
  ChipItemsContext,
  chipKit,
  EditorKit,
  ImageKit,
  initialValue,
} from '@/components/plate/editor/plugins/editor-kit';
import { TemplateKit } from '@/components/plate/editor/plugins/menu-kit';
import { Editor, EditorContainer } from '@/components/plate/ui/editor';
import {
  BASIC_BLOCKS,
  type EditorTemplate,
  MenuItemsContext,
} from '@/components/plate/ui/menu-node';
import { cn } from '@/lib/cn';
import { FormatButtons } from '@/components/plate/ui/format-buttons';
import { Toolbar } from '@/components/plate/ui/toolbar';
import { TooltipProvider } from '@/components/plate/ui/tooltip';
import { lineToValue, valueToLine } from './single-line';

/**
 * Markdown in, markdown out: a bordered field with a format bar, and the shared editor kit (lists,
 * links, tables, emoji, Markdown shortcuts as you type). Long documents use `DocumentEditor`.
 * `chips` turns on "@" for people and "{" for details such as First name. `templates` turns on "#"
 * on an empty line to insert one (saved replies in the message composer). `header` renders inside
 * the editor, so it can use `useEditorRef()` to insert text.
 *
 * `singleLine` makes a one-line field (an email subject): plain text with "{" detail chips, no
 * format bar and no Markdown, so the value is the text as typed with `{{key}}` for each chip.
 * `header` then sits at the right end of the field.
 *
 * Pictures are on (the Picture button, paste or drop; each needs a description before saving, see
 * `imagesWithoutAlt`). Pass `images={false}` where a picture makes no sense, such as saved replies.
 */
export function PlateMarkdownEditor({
  value,
  onChange,
  placeholder = 'Write here…',
  header,
  chips,
  templates,
  editorClassName,
  headings = true,
  singleLine = false,
  'aria-label': ariaLabel,
  invalid = false,
  images = true,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  header?: ReactNode;
  chips?: ChipSets;
  templates?: EditorTemplate[];
  /** Replaces the writing area's height and padding, for example a short composer. */
  editorClassName?: string;
  /** Off for short messages: the format bar drops headings and quotes. */
  headings?: boolean;
  /** One line of plain text with detail chips, for a subject. */
  singleLine?: boolean;
  'aria-label'?: string;
  /** Shows the field in the error colour. */
  invalid?: boolean;
  /** Pictures in the text. Off for saved replies and other short messages. */
  images?: boolean;
}) {
  const editor = usePlateEditor({
    plugins: (singleLine
      ? [SingleLinePlugin, ...chipKit(chips)]
      : [
          ...EditorKit,
          ...(images ? ImageKit : []),
          ...chipKit(chips),
          ...(templates ? TemplateKit : []),
        ]) as typeof EditorKit,
    value: (instance) =>
      singleLine
        ? normalizeStaticValue(lineToValue(value) as Value)
        : initialValue(instance, value),
  });

  if (singleLine)
    return (
      <ChipItemsContext.Provider value={chips ?? {}}>
        <Plate editor={editor} onValueChange={({ value: next }) => onChange(valueToLine(next))}>
          <div
            className={cn(
              'flex min-h-9 items-center gap-1 rounded-md border bg-card pr-1 transition-colors focus-within:border-primary',
              invalid ? 'border-destructive' : 'border-input',
            )}
          >
            <EditorContainer variant="default" className="min-w-0 flex-1 overflow-visible">
              <Editor
                variant="none"
                placeholder={placeholder}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                aria-multiline={false}
                className={cn('px-3 py-1.5 text-base text-fg', editorClassName)}
              />
            </EditorContainer>
            {header}
          </div>
        </Plate>
      </ChipItemsContext.Provider>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <MenuItemsContext.Provider value={{ blocks: BASIC_BLOCKS, templates: templates ?? [] }}>
        <ChipItemsContext.Provider value={chips ?? {}}>
          <Plate
            editor={editor}
            onValueChange={({ value: next }) => onChange(serializeMd(editor, { value: next }))}
          >
            <div className="rounded-md border border-input bg-card transition-colors focus-within:border-primary">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-t-md border-b border-border-subtle px-1.5 py-1">
                <Toolbar aria-label="Formatting" className="flex-wrap gap-0.5">
                  <FormatButtons headings={headings} />
                </Toolbar>
                {header}
              </div>
              <EditorContainer variant="default" className="overflow-visible">
                <Editor
                  variant="none"
                  placeholder={placeholder}
                  className={cn(
                    'text-base text-fg',
                    editorClassName ?? 'min-h-60 px-4 py-3 sm:px-5 sm:py-4',
                  )}
                />
              </EditorContainer>
            </div>
          </Plate>
        </ChipItemsContext.Provider>
      </MenuItemsContext.Provider>
    </TooltipProvider>
  );
}
