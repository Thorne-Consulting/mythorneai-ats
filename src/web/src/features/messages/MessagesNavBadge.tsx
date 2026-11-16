'use client';

import { cn } from '@/lib/cn';
import { useInboxUnread } from './live';

/** The unread count beside "Messages" in the sidebar. Updates live. */
export function MessagesNavBadge({ className }: { className?: string }) {
  const unread = useInboxUnread();
  if (unread === 0) return null;
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-bold text-brand-foreground tnum',
        className,
      )}
      aria-label={`${unread} unread`}
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
}
