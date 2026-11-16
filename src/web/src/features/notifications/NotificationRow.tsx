'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { IconDisc, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { lookOf, type AppNotification } from './notifications-data';

/** One entry in the bell and on /notifications: opening it marks it read. */
export function NotificationRow({
  item,
  onRead,
  compact = false,
}: {
  item: AppNotification;
  onRead: (id: string) => void;
  compact?: boolean;
}) {
  const { icon, tone } = lookOf(item.kind);
  const unread = !item.readAt;
  return (
    <li
      className={cn(
        'group relative flex items-start gap-1 pr-2 hover:bg-muted',
        unread && 'bg-accent/30',
      )}
    >
      <Link
        href={item.href}
        onClick={() => unread && onRead(item.id)}
        className={cn(
          'flex min-w-0 flex-1 gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          compact ? 'py-2.5 pl-4' : 'py-3.5 pl-5',
        )}
      >
        <IconDisc icon={icon} tone={tone} size={compact ? 'sm' : 'md'} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm text-fg',
              unread ? 'font-semibold' : 'font-medium',
              compact ? 'line-clamp-2' : '',
            )}
          >
            {item.title}
          </span>
          {item.body && (
            <span
              className={cn(
                'mt-0.5 block text-sm text-fg-muted',
                compact ? 'line-clamp-1' : 'line-clamp-2',
              )}
            >
              {item.body}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-fg-subtle">
            {formatRelative(item.createdAt)}
          </span>
        </span>
      </Link>
      {unread ? (
        <>
          <span
            aria-hidden
            className="absolute top-1/2 right-3 size-2 -translate-y-1/2 rounded-full bg-primary group-hover:hidden group-focus-within:hidden max-md:hidden"
          />
          <IconButton
            size="sm"
            variant="quiet"
            label={`Mark “${item.title}” as read`}
            className="mt-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            onClick={() => onRead(item.id)}
          >
            <Check />
          </IconButton>
        </>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
    </li>
  );
}
