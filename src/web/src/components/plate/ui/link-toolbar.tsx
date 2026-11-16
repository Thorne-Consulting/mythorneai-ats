'use client';

import * as React from 'react';

import { flip, offset } from '@platejs/floating';
import {
  FloatingLinkUrlInput,
  LinkOpenButton,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
  useLinkToolbarButton,
  useLinkToolbarButtonState,
} from '@platejs/link/react';
import { ExternalLink, Link, Text, Unlink } from 'lucide-react';
import { useFormInputProps } from 'platejs/react';

import { cn } from '@/components/plate/lib/utils';

import { ToolbarButton } from './toolbar';

const boxClass =
  'z-50 rounded-lg border border-border bg-popover p-1 text-fg shadow-pop outline-none';
const inputClass =
  'h-8 w-full min-w-0 bg-transparent px-1.5 text-base outline-none placeholder:text-fg-subtle';
const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg hover:bg-accent hover:text-accent-foreground [&_svg]:size-4';

const floatingOptions = {
  middleware: [offset(8), flip({ fallbackPlacements: ['top-start'], padding: 12 })],
  placement: 'bottom-start' as const,
};

/**
 * The small box under a link: paste or type a web address, or open, edit and remove the link
 * under the cursor. ⌘K opens it. Only web and email addresses are accepted (see `linkOptions`).
 */
export function LinkFloatingToolbar() {
  const insertState = useFloatingLinkInsertState({ floatingOptions });
  const {
    hidden,
    props: insertProps,
    ref: insertRef,
    textInputProps,
  } = useFloatingLinkInsert(insertState);
  const editState = useFloatingLinkEditState({ floatingOptions });
  const {
    editButtonProps,
    props: editProps,
    ref: editRef,
    unlinkButtonProps,
  } = useFloatingLinkEdit(editState);
  const inputProps = useFormInputProps({ preventDefaultOnEnterKeydown: true });

  if (hidden) return null;

  const form = (
    <div className="flex w-[min(330px,calc(100vw-32px))] flex-col" {...inputProps}>
      <label className="flex items-center gap-1 px-1.5">
        <Link className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="sr-only">Web address</span>
        <FloatingLinkUrlInput className={inputClass} placeholder="Paste a link" data-plate-focus />
      </label>
      <div className="mx-1 my-1 h-px bg-border-subtle" />
      <label className="flex items-center gap-1 px-1.5">
        <Text className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="sr-only">Text to show</span>
        <input
          className={inputClass}
          placeholder="Text to show"
          data-plate-focus
          {...textInputProps}
        />
      </label>
    </div>
  );

  return (
    <>
      <div ref={insertRef} className={boxClass} {...insertProps}>
        {form}
      </div>
      <div ref={editRef} className={boxClass} {...editProps}>
        {editState.isEditing ? (
          form
        ) : (
          <div className="flex items-center gap-0.5">
            <button type="button" className={actionClass} {...editButtonProps}>
              Edit link
            </button>
            <LinkOpenButton className={actionClass} aria-label="Open link in a new tab">
              <ExternalLink />
            </LinkOpenButton>
            <button
              type="button"
              className={cn(actionClass, 'hover:text-destructive')}
              aria-label="Remove link"
              {...unlinkButtonProps}
            >
              <Unlink />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function LinkToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const state = useLinkToolbarButtonState();
  const { props: buttonProps } = useLinkToolbarButton(state);
  return (
    <ToolbarButton {...props} {...buttonProps} data-plate-focus tooltip="Link (⌘K)">
      <Link />
    </ToolbarButton>
  );
}
