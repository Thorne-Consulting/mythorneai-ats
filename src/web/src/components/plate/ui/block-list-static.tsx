import * as React from 'react';

import type { RenderStaticNodeWrapper, TListElement } from 'platejs';
import type { SlateRenderElementProps } from 'platejs/static';

import { isOrderedList } from '@platejs/list';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/components/plate/lib/utils';

/**
 * Plate stores a list as indented paragraphs with a `listStyleType`. This wraps each one in its own
 * `<ul>` or `<ol start>` so bullets and numbers line up. Shared by the editor (`block-list.tsx`).
 */
export const BlockListStatic: RenderStaticNodeWrapper = ({ element }) => {
  if (!element.listStyleType) return;
  return (props) => <ListItem {...props} />;
};

export function ListItem(props: SlateRenderElementProps) {
  const { listStart, listStyleType } = props.element as TListElement;
  const todo = listStyleType === 'todo';
  const List = !todo && isOrderedList(props.element) ? 'ol' : 'ul';
  return (
    <List
      className="relative m-0 p-0 marker:text-fg-muted"
      style={{ listStyleType: todo ? 'none' : listStyleType }}
      start={listStart}
    >
      {todo ? (
        <li className={cn('relative', props.element.checked ? 'text-fg-subtle line-through' : '')}>
          <TodoMarker checked={!!props.element.checked} />
          {props.children}
        </li>
      ) : (
        <li>{props.children}</li>
      )}
    </List>
  );
}

export const todoBoxClass = (checked: boolean) =>
  cn(
    'absolute top-[0.3em] -left-6 flex size-4 items-center justify-center rounded-xs border select-none',
    checked
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-control bg-card text-transparent',
  );

/** The read-only tick box. The editor's `block-list.tsx` swaps in a clickable one. */
function TodoMarker({ checked }: { checked: boolean }) {
  return (
    <span contentEditable={false} aria-hidden className={todoBoxClass(checked)}>
      <CheckIcon className="size-3" strokeWidth={3} />
    </span>
  );
}
