'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import { type ChipSets, ChipElement, ChipInputElement } from '@/components/plate/ui/chip-node';

export { type ChipItem, type ChipSets, ChipItemsContext } from '@/components/plate/ui/chip-node';

/**
 * "@" picks a person, "{" picks a detail such as First name. Each trigger is on only when the
 * editor was given that list. Stored in Markdown as `[Name](mention:email)` and `{{firstName}}`
 * (see `markdown-kit.tsx`). The lists themselves come through `ChipItemsContext`, so they can
 * change without rebuilding the editor.
 */
export function chipKit(sets?: ChipSets) {
  const trigger = [sets?.people && '@', sets?.details && '{'].filter(Boolean) as string[];
  if (!trigger.length) return [];
  return [
    MentionPlugin.configure({
      options: { trigger, triggerPreviousCharPattern: /^$|^[\s"'({[]$/ },
    }).withComponent(ChipElement),
    MentionInputPlugin.withComponent(ChipInputElement),
  ];
}
