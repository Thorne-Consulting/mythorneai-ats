'use client';

import { type PlateElementProps, PlateElement } from 'platejs/react';

import { blockquoteClass } from './blockquote-node-static';

export function BlockquoteElement(props: PlateElementProps) {
  return <PlateElement as="blockquote" className={blockquoteClass} {...props} />;
}
