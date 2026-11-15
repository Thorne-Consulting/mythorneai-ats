'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellOff, CheckCheck, Settings } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, SkeletonRows, Tabs, toast } from '@/components/ui';
import { NotificationRow } from './NotificationRow';
import {
  flattenFeed,
  useMarkNotifications,
  useNotificationCount,
  useNotificationFeed,
} from './notifications-data';

/** Everything that happened for me: candidate replies, mentions, approvals, interviews and more. */
export function NotificationsPage() {
  const [status, setStatus] = useState<'unread' | 'all'>('unread');
  const unread = useNotificationCount().data?.unread ?? 0;
  const feed = useNotificationFeed(status);
  const mark = useMarkNotifications();
  const items = flattenFeed(feed.data);

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button asChild variant="quiet">
              <Link href="/settings/notifications">
                <Settings aria-hidden />
                Notification settings
              </Link>
            </Button>
            {unread > 0 && (
              <Button
                variant="secondary"
                leftIcon={<CheckCheck />}
                loading={mark.isPending}
                onClick={() =>
                  mark.mutate(
                    { all: true },
                    {
                      onSuccess: () => toast.success('All caught up'),
                      onError: (e: Error) => toast.error('Could not mark them as read', e.message),
                    },
                  )
                }
              >
                Mark all as read
              </Button>
            )}
          </>
        }
      />
      <Card className="overflow-hidden">
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as 'unread' | 'all')}
          aria-label="Which notifications"
          className="border-b border-border-subtle px-5 pt-2"
          items={[
            { value: 'unread', label: 'Unread', count: unread },
            { value: 'all', label: 'All' },
          ]}
        />
        {!feed.data ? (
          <SkeletonRows rows={6} className="p-5" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={status === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
            description={
              status === 'unread'
                ? 'New replies, mentions and requests for you show up here.'
                : 'When a candidate writes or someone needs you, it shows up here.'
            }
            action={
              status === 'unread' && (
                <Button variant="secondary" size="sm" onClick={() => setStatus('all')}>
                  Show all notifications
                </Button>
              )
            }
            className="py-14"
          />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onRead={(id) => mark.mutate({ ids: [id] })}
                />
              ))}
            </ul>
            {feed.hasNextPage && (
              <div className="flex justify-center border-t border-border-subtle p-3">
                <Button
                  variant="quiet"
                  size="sm"
                  loading={feed.isFetchingNextPage}
                  onClick={() => feed.fetchNextPage()}
                >
                  Show older notifications
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
