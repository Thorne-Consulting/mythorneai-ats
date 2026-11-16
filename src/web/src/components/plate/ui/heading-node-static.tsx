import * as React from 'react';

import type { SlateElementProps } from 'platejs/static';

import { type VariantProps, cva } from 'class-variance-authority';
import { SlateElement } from 'platejs/static';

/** Document headings on the token type scale. Shared with the editor's `heading-node.tsx`. */
export const headingVariants = cva(
  'relative mb-1 font-heading text-fg first:mt-0 data-[nav-target=true]:rounded-md data-[nav-target=true]:bg-(--color-highlight)',
  {
    variants: {
      variant: {
        h1: 'mt-6 text-2xl font-bold tracking-[-0.01em]',
        h2: 'mt-5 text-xl font-semibold',
        h3: 'mt-4 text-lg font-semibold',
        h4: 'mt-3 text-md font-semibold',
        h5: 'mt-3 text-base font-semibold',
        h6: 'mt-3 text-sm font-semibold text-fg-muted',
      },
    },
  },
);

export function HeadingElementStatic({
  variant = 'h1',
  ...props
}: SlateElementProps & VariantProps<typeof headingVariants>) {
  return <SlateElement as={variant!} className={headingVariants({ variant })} {...props} />;
}

export function H1ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h1" {...props} />;
}

export function H2ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h2" {...props} />;
}

export function H3ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h3" {...props} />;
}

export function H4ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h4" {...props} />;
}

export function H5ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h5" {...props} />;
}

export function H6ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h6" {...props} />;
}
