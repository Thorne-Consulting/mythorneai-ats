'use client';

import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A vertical list people reorder by dragging the handle (mouse, touch) or with the keyboard (focus
 * the handle, Space, arrow keys, Space). Screen readers hear where the row lands. Each row gets
 * its handle to place where it fits.
 */
export function SortableList<T>({
  id,
  items,
  getKey,
  getLabel,
  onReorder,
  renderItem,
  className,
  itemClassName,
}: {
  /** Stable id for the drag context (server and browser markup must match). */
  id: string;
  items: T[];
  getKey: (item: T) => string;
  /** How the row is named to screen readers ("Move Sam Lee"). */
  getLabel: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, handle: ReactNode, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const keys = items.map(getKey);
  const nameOf = (key: string | number) => {
    const item = items.find((i) => getKey(i) === key);
    return item ? getLabel(item) : 'the item';
  };
  const position = (key: string | number) => keys.indexOf(String(key)) + 1;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
  };
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${nameOf(active.id)} is now at position ${position(over.id)} of ${items.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${nameOf(active.id)} dropped at position ${position(over.id)}.`
              : `${nameOf(active.id)} dropped.`,
          onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
        },
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ol className={cn('flex flex-col gap-2', className)}>
          {items.map((item, index) => (
            <SortableRow
              key={getKey(item)}
              id={getKey(item)}
              label={getLabel(item)}
              className={itemClassName}
              render={(handle) => renderItem(item, handle, index)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  className,
  render,
}: {
  id: string;
  label: string;
  className?: string;
  render: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Move ${label}. Press Space, then the arrow keys.`}
      className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-subtle hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      // Dynamic position while dragging.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-border-subtle bg-card',
        isDragging && 'relative z-10 shadow-pop',
        className,
      )}
    >
      {render(handle)}
    </li>
  );
}
