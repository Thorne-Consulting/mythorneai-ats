'use client';

import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, SkeletonRows } from '@/components/ui';
import { NotificationRow } from './NotificationRow';
import {
  flattenFeed,
  useMarkNotifications,
  useNotificationCount,
  useNotificationFeed,
} from './notifications-data';

/** The header bell: a window onto the same feed as /notifications, with a live unread count. */
export function NotificationBell() {
  const count = useNotificationCount().data?.unread ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
          className="relative rounded-md p-1.5 text-white hover:bg-nav-hover focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <Bell className="size-6" strokeWidth={1.75} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-2xs font-bold text-brand-foreground tnum">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-1.5rem))] p-0">
        <BellFeed unread={count} />
      </PopoverContent>
    </Popover>
  );
}

// Mounted only while the popover is open, so the feed loads on demand.
function BellFeed({ unread }: { unread: number }) {
  const feed = useNotificationFeed('all', 8);
  const mark = useMarkNotifications();
  const items = flattenFeed(feed.data).slice(0, 8);
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
        <p className="text-base font-semibold text-fg">Notifications</p>
        {unread > 0 && (
          <Button
            variant="quiet"
            size="xs"
            leftIcon={<CheckCheck />}
            loading={mark.isPending}
            onClick={() => mark.mutate({ all: true })}
          >
            Mark all as read
          </Button>
        )}
      </div>
      {!feed.data ? (
        <SkeletonRows rows={4} className="p-4" />
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-fg-subtle">
          Nothing yet. We’ll tell you here when a candidate writes or someone needs you.
        </p>
      ) : (
        <ul className="max-h-[440px] divide-y divide-border-subtle overflow-y-auto">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              compact
              onRead={(id) => mark.mutate({ ids: [id] })}
            />
          ))}
        </ul>
      )}
      <Link
        href="/notifications"
        className="block border-t border-border-subtle px-4 py-2.5 text-center text-sm font-medium text-accent-foreground hover:bg-muted"
      >
        Open notifications
      </Link>
    </>
  );
}
