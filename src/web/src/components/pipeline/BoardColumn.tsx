'use client';

import { useState, type ReactNode, type Ref } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toneDot, type Tone } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * One column of a drag-and-drop board (pipeline stages, job statuses). Figma: pale well,
 * coloured dot + title + count, "•••" menu, cards, "View N more" footer.
 * Pass `onDropItem` to accept native drops (the dragged id travels as text/plain), or `dropRef`
 * and `isOver` from a dnd-kit droppable (the pipeline board, with touch and keyboard).
 */
export function BoardColumn({
  title,
  count,
  tone = 'gray',
  menu,
  footer,
  onDropItem,
  empty = 'Drop here',
  meta,
  dropRef,
  isOver,
  className,
  children,
}: {
  title: ReactNode;
  count?: number;
  tone?: Tone;
  menu?: ReactNode;
  footer?: ReactNode;
  onDropItem?: (id: string) => void;
  empty?: ReactNode;
  /** Small text after the count, for example "4 days on average". */
  meta?: ReactNode;
  dropRef?: Ref<HTMLElement>;
  isOver?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section
      ref={dropRef}
      aria-label={typeof title === 'string' ? title : undefined}
      onDragOver={
        onDropItem
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={
        onDropItem
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const id = e.dataTransfer.getData('text/plain');
              if (id) onDropItem(id);
            }
          : undefined
      }
      className={cn(
        'flex w-[248px] shrink-0 flex-col rounded-lg bg-well p-2.5 transition-shadow',
        (over || isOver) && 'ring-2 ring-primary ring-inset',
        className,
      )}
    >
      <header className="px-1.5 pt-1 pb-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', toneDot(tone))} />
          <h3 className="min-w-0 truncate text-base font-semibold text-fg">{title}</h3>
          {count !== undefined && <span className="text-xs text-fg-subtle tnum">{count}</span>}
          <span className="ml-auto shrink-0">
            {menu ?? <MoreHorizontal className="size-4 text-fg-subtle" aria-hidden />}
          </span>
        </div>
        {meta && <p className="mt-0.5 truncate pl-4 text-2xs text-fg-subtle">{meta}</p>}
      </header>
      <div className="flex flex-1 flex-col gap-2.5">
        {hasChildren ? (
          children
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
            {empty}
          </p>
        )}
      </div>
      {footer && <div className="pt-2.5 text-center text-xs">{footer}</div>}
    </section>
  );
}

/** Horizontal scroller for board columns. */
export function Board({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('-mx-1 flex min-w-0 max-w-full gap-3 overflow-x-auto px-1 pb-3', className)}>
      {children}
    </div>
  );
}
