import type { ReactNode } from 'react';

import { deserializeMd } from '@platejs/markdown';
import { BaseMentionPlugin } from '@platejs/mention';
import { createStaticEditor, PlateStatic } from 'platejs/static';

import { BaseBasicBlocksKit } from '@/components/plate/editor/plugins/basic-blocks-base-kit';
import { BaseBasicMarksKit } from '@/components/plate/editor/plugins/basic-marks-base-kit';
import { BaseLinkKit } from '@/components/plate/editor/plugins/link-base-kit';
import { BaseListKit } from '@/components/plate/editor/plugins/list-base-kit';
import { MarkdownKit } from '@/components/plate/editor/plugins/markdown-kit';
import { BaseTableKit } from '@/components/plate/editor/plugins/table-base-kit';
import { ChipElementStatic } from '@/components/plate/ui/chip-node-static';
import { BaseImageKit } from '@/components/plate/ui/image-node-static';
import { cn } from '@/lib/cn';

const plugins = [
  ...BaseBasicBlocksKit,
  ...BaseBasicMarksKit,
  ...BaseListKit,
  ...BaseLinkKit,
  ...BaseTableKit,
  ...BaseImageKit,
  BaseMentionPlugin.withComponent(ChipElementStatic),
  ...MarkdownKit,
];

/**
 * Stored Markdown, rendered read-only. No hooks and no client code, so it works in server
 * components (careers pages) and client ones alike, with the same output on both sides.
 * Body text inherits the size of its container; pass `className="text-md"` for a larger read.
 */
export function RichText({
  markdown,
  className,
  empty = null,
}: {
  markdown?: string | null;
  className?: string;
  /** Shown when there is nothing to render. */
  empty?: ReactNode;
}) {
  if (!markdown?.trim()) return empty;
  // nodeId: false keeps the output free of random ids, so server and client markup match.
  const editor = createStaticEditor({ plugins, nodeId: false });
  const value = deserializeMd(editor, markdown);
  return (
    <PlateStatic
      editor={editor}
      value={value}
      className={cn(
        'rich-text min-w-0 leading-relaxed break-words text-fg [&_strong]:font-semibold',
        className,
      )}
    />
  );
}
