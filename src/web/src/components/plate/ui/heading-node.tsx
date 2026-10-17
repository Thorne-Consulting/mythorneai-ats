'use client';

import * as React from 'react';

import type { PlateElementProps } from 'platejs/react';

import { type VariantProps, cva } from 'class-variance-authority';
import { PlateElement } from 'platejs/react';

const headingVariants = cva(
  'relative mb-1 data-[nav-target=true]:rounded-md data-[nav-target=true]:bg-(--color-highlight)',
  {
    variants: {
      variant: {
        h1: 'mt-[1.6em] pb-px font-heading text-(length:--mantine-h1-font-size) leading-(--mantine-h1-line-height) font-(--mantine-h1-font-weight)',
        h2: 'mt-[1.4em] pb-px font-heading text-(length:--mantine-h2-font-size) leading-(--mantine-h2-line-height) font-(--mantine-h2-font-weight)',
        h3: 'mt-[1em] pb-px font-heading text-(length:--mantine-h3-font-size) leading-(--mantine-h3-line-height) font-(--mantine-h3-font-weight)',
        h4: 'mt-[0.75em] pb-px font-heading text-(length:--mantine-h4-font-size) leading-(--mantine-h4-line-height) font-(--mantine-h4-font-weight)',
        h5: 'mt-[0.75em] pb-px font-heading text-(length:--mantine-h5-font-size) leading-(--mantine-h5-line-height) font-(--mantine-h5-font-weight)',
        h6: 'mt-[0.75em] pb-px font-heading text-(length:--mantine-h6-font-size) leading-(--mantine-h6-line-height) font-(--mantine-h6-font-weight)',
      },
    },
  },
);

export function HeadingElement({
  variant = 'h1',
  ...props
}: PlateElementProps & VariantProps<typeof headingVariants>) {
  return (
    <PlateElement as={variant!} className={headingVariants({ variant })} {...props}>
      {props.children}
    </PlateElement>
  );
}

export function H1Element(props: PlateElementProps) {
  return <HeadingElement variant="h1" {...props} />;
}

export function H2Element(props: PlateElementProps) {
  return <HeadingElement variant="h2" {...props} />;
}

export function H3Element(props: PlateElementProps) {
  return <HeadingElement variant="h3" {...props} />;
}

export function H4Element(props: PlateElementProps) {
  return <HeadingElement variant="h4" {...props} />;
}

export function H5Element(props: PlateElementProps) {
  return <HeadingElement variant="h5" {...props} />;
}

export function H6Element(props: PlateElementProps) {
  return <HeadingElement variant="h6" {...props} />;
}
