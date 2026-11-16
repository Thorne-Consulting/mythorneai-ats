import * as React from 'react';

import type { SlateElementProps } from 'platejs/static';

import { SlateElement } from 'platejs/static';

export function HrElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props}>
      <div className="py-4" contentEditable={false}>
        <hr className="h-px border-none bg-border" />
      </div>
      {props.children}
    </SlateElement>
  );
}
