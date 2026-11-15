import * as React from 'react';

import type { TLinkElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { getLinkAttributes } from '@platejs/link';
import { SlateElement } from 'platejs/static';

export const linkClass =
  'font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2 hover:decoration-accent-foreground';

export function LinkElementStatic(props: SlateElementProps<TLinkElement>) {
  return (
    <SlateElement
      {...props}
      as="a"
      className={linkClass}
      attributes={{ ...props.attributes, ...getLinkAttributes(props.editor, props.element) }}
    >
      {props.children}
    </SlateElement>
  );
}
