'use client';

import * as React from 'react';

import type { TLinkElement } from 'platejs';

import { getLinkAttributes } from '@platejs/link';
import { type PlateElementProps, PlateElement } from 'platejs/react';

import { linkClass } from './link-node-static';

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className={linkClass}
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        // Keeps the editor's own hover handling from fighting the link box.
        onMouseOver: (event) => event.stopPropagation(),
      }}
    >
      {props.children}
    </PlateElement>
  );
}
