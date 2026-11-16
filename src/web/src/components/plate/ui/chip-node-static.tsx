import * as React from 'react';

import type { TMentionElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { SlateElement } from 'platejs/static';

import { cn } from '@/components/plate/lib/utils';
import { humanize } from '@/lib/format';

/**
 * A chip is Plate's mention node with a `trigger`: "@" for a person, "{" for a detail that is
 * filled in later (for example First name). See `chip-kit.tsx` for how both are stored.
 */
export type TChipElement = TMentionElement & { key?: string; trigger?: '@' | '{' };

export const isDetail = (element: TChipElement) => element.trigger === '{';

export const chipClass = (element: TChipElement) =>
  cn(
    'inline-block align-baseline font-medium',
    isDetail(element)
      ? 'mx-px rounded-sm bg-tone-blue-bg px-1 text-[0.92em] text-tone-blue-fg'
      : 'text-accent-foreground',
  );

/** What a chip shows when no item list is at hand: the person's name, or the detail's key in words. */
export const chipText = (element: TChipElement, label?: string) =>
  isDetail(element)
    ? (label ?? humanize(element.key ?? element.value))
    : `@${label ?? element.value}`;

export function ChipElementStatic(props: SlateElementProps<TChipElement>) {
  return (
    <SlateElement {...props} as="span" className={chipClass(props.element)}>
      {chipText(props.element)}
      {props.children}
    </SlateElement>
  );
}
