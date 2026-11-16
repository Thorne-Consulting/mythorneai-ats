'use client';

import * as React from 'react';

import {
  useIndentTodoToolBarButton,
  useIndentTodoToolBarButtonState,
  useListToolbarButton,
  useListToolbarButtonState,
} from '@platejs/list/react';
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  UnderlineIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { EmojiToolbarButton } from './emoji-node';
import { ImageToolbarButton } from './image-node';
import { LinkToolbarButton } from './link-toolbar';
import { MarkToolbarButton } from './mark-toolbar-button';
import { ToolbarButton, ToolbarGroup } from './toolbar';

function TurnInto({
  type,
  tooltip,
  icon,
}: {
  type: string;
  tooltip: string;
  icon: React.ReactNode;
}) {
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

function ListButton({
  type,
  tooltip,
  icon,
}: {
  type: string;
  tooltip: string;
  icon: React.ReactNode;
}) {
  const state = useListToolbarButtonState({ nodeType: type });
  const { props } = useListToolbarButton(state);
  return (
    <ToolbarButton {...props} tooltip={tooltip}>
      {icon}
    </ToolbarButton>
  );
}

function TodoButton() {
  const state = useIndentTodoToolBarButtonState({ nodeType: 'todo' });
  const { props } = useIndentTodoToolBarButton(state);
  return (
    <ToolbarButton {...props} tooltip="To-do list ([] then space)">
      <ListTodoIcon />
    </ToolbarButton>
  );
}

/**
 * The one set of format buttons. The field editor shows them in a fixed bar; the document editor
 * shows them (without emoji) in the bar that floats over selected text.
 */
export function FormatButtons({
  emoji = true,
  headings = true,
  inserts = true,
}: {
  emoji?: boolean;
  /** Off for short messages: no headings or quotes. */
  headings?: boolean;
  /** The Picture button (when the editor takes pictures). Off in the bar over selected text. */
  inserts?: boolean;
}) {
  return (
    <>
      {/* Groups wrap as a whole on a narrow screen, so related buttons stay together. */}
      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘B)">
          <BoldIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘I)">
          <ItalicIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘U)">
          <UnderlineIcon />
        </MarkToolbarButton>
      </ToolbarGroup>
      {headings && (
        <ToolbarGroup>
          <TurnInto type={KEYS.h1} tooltip="Heading 1 (# then space)" icon={<Heading1Icon />} />
          <TurnInto type={KEYS.h2} tooltip="Heading 2 (## then space)" icon={<Heading2Icon />} />
          <TurnInto type={KEYS.h3} tooltip="Heading 3 (### then space)" icon={<Heading3Icon />} />
          <TurnInto type={KEYS.blockquote} tooltip="Quote (> then space)" icon={<QuoteIcon />} />
        </ToolbarGroup>
      )}
      <ToolbarGroup>
        <ListButton type={KEYS.ul} tooltip="Bulleted list (- then space)" icon={<ListIcon />} />
        <ListButton
          type={KEYS.ol}
          tooltip="Numbered list (1. then space)"
          icon={<ListOrderedIcon />}
        />
        <TodoButton />
      </ToolbarGroup>
      <ToolbarGroup>
        <LinkToolbarButton />
        {inserts && <ImageToolbarButton />}
        {emoji && <EmojiToolbarButton />}
      </ToolbarGroup>
    </>
  );
}
