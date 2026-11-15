'use client';

import * as React from 'react';

import type { TListElement } from 'platejs';

import { isOrderedList } from '@platejs/list';
import { useTodoListElement, useTodoListElementState } from '@platejs/list/react';
import { CheckIcon } from 'lucide-react';
import { type PlateElementProps, type RenderNodeWrapper, useReadOnly } from 'platejs/react';

import { cn } from '@/components/plate/lib/utils';

import { todoBoxClass } from './block-list-static';

/** Editor twin of `BlockListStatic`, with a tick box you can click. */
export const BlockList: RenderNodeWrapper = ({ element }) => {
  if (!element.listStyleType) return;
  return (props) => <ListItem {...props} />;
};

function ListItem(props: PlateElementProps) {
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
          <TodoBox {...props} />
          {props.children}
        </li>
      ) : (
        <li>{props.children}</li>
      )}
    </List>
  );
}

function TodoBox({ element }: PlateElementProps) {
  const state = useTodoListElementState({ element });
  const { checkboxProps } = useTodoListElement(state);
  const readOnly = useReadOnly();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checkboxProps.checked}
      aria-label={checkboxProps.checked ? 'Mark as not done' : 'Mark as done'}
      contentEditable={false}
      disabled={readOnly}
      className={cn(todoBoxClass(checkboxProps.checked), 'cursor-pointer disabled:cursor-default')}
      onMouseDown={checkboxProps.onMouseDown}
      onClick={() => checkboxProps.onCheckedChange(!checkboxProps.checked)}
    >
      <CheckIcon className="size-3" strokeWidth={3} />
    </button>
  );
}
