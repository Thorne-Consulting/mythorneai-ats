import * as React from 'react';

import { type SlateElementProps, SlateElement } from 'platejs/static';

export const blockquoteClass = 'my-2 border-l-2 border-border pl-4 text-fg-muted';

export function BlockquoteElementStatic(props: SlateElementProps) {
  return <SlateElement as="blockquote" className={blockquoteClass} {...props} />;
}
