'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, CheckCheck, Inbox, RotateCcw } from 'lucide-react';
import { api } from '@/api';
import { DataTable } from '@/components/data-table/DataTable';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  IconDisc,
  PageHeader,
  SegmentedControl,
  Tabs,
  toast,
} from '@/components/ui';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import { formatRelative } from '@/lib/format';
import type { DashboardData } from '@/types';
import {
  buildNotifications,
  kindLabels,
  type NotificationItem,
  type NotificationKind,
  useDoneNotifications,
} from './notification-items';

export function useNotifications() {
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });
  const approvals = usePendingApprovals();
  return {
    items: buildNotifications(dashboard.data, approvals.data),
    stalledTotal: dashboard.data?.stalledTotal ?? 0,
    stalledShown: dashboard.data?.stalled.length ?? 0,
    loading: dashboard.isLoading || approvals.isLoading,
  };
}

const kinds = Object.keys(kindLabels) as NotificationKind[];

/** /notifications: everything waiting on you, filterable, with a local "done" list. */
export function NotificationsPage() {
  const router = useRouter();
  const { items, stalledTotal, stalledShown, loading } = useNotifications();
  const [done, setDone] = useDoneNotifications();
  const [kind, setKind] = useState<'all' | NotificationKind>('all');
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [selected, setSelected] = useState<string[]>([]);

  const live = new Set(items.map((item) => item.key));
  // Forget done keys for items that no longer exist, so the list doesn't grow forever.
  const mark = (keys: string[], on: boolean) =>
    setDone((current) => {
      const kept = current.filter((key) => (loading || live.has(key)) && !keys.includes(key));
      return on ? [...kept, ...keys] : kept;
    });
  const open = items.filter((item) => !done.has(item.key));
  const pool = show === 'open' ? open : items.filter((item) => done.has(item.key));
  const visible = kind === 'all' ? pool : pool.filter((item) => item.kind === kind);

  const markSelected = () => {
    mark(selected, show === 'open');
    toast.success(
      show === 'open'
        ? `Marked ${selected.length} as done`
        : `Moved ${selected.length} back to your list`,
    );
    setSelected([]);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything waiting on you: approvals, feedback you owe, candidate replies and applications with no recent activity."
        actions={
          <SegmentedControl
            aria-label="Show"
            value={show}
            onValueChange={(value) => {
              setShow(value as 'open' | 'done');
              setSelected([]);
            }}
            items={[
              { value: 'open', label: `To do (${open.length})` },
              { value: 'done', label: 'Done' },
            ]}
          />
        }
      />
      <Card className="px-4 pt-2">
        <Tabs
          aria-label="Type"
          value={kind}
          onValueChange={(value) => setKind(value as typeof kind)}
          items={[
            { value: 'all', label: 'All', count: pool.length },
            ...kinds.map((value) => ({
              value,
              label: kindLabels[value],
              count: pool.filter((item) => item.kind === value).length,
            })),
          ]}
        />
        <DataTable<NotificationItem>
          data={visible}
          getRowId={(item) => item.key}
          viewKey="notifications"
          noun="item"
          loading={loading}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={
            <Button size="sm" variant="secondary" onClick={markSelected}>
              {show === 'open' ? 'Mark as done' : 'Move back to To do'}
            </Button>
          }
          onRowOpen={(item) => router.push(item.href)}
          rowLabel={(item) => item.title}
          empty={
            <EmptyState
              icon={show === 'open' ? CheckCheck : Inbox}
              title={show === 'open' ? 'You’re all caught up' : 'Nothing marked done'}
              description={
                show === 'open'
                  ? 'New items show up here as soon as they need you.'
                  : 'Items you mark as done move here. Only this browser keeps this list.'
              }
              action={
                <Button asChild variant="secondary">
                  <Link href="/">Back to the dashboard</Link>
                </Button>
              }
            />
          }
          columns={[
            {
              id: 'item',
              header: 'What',
              hideable: false,
              sortValue: (item) => item.title,
              cell: (item) => (
                <span className="flex min-w-0 items-center gap-3">
                  <IconDisc icon={item.icon} tone={item.tone} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{item.title}</span>
                    <span className="block max-w-[52ch] truncate text-xs text-fg-subtle">
                      {item.meta}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              id: 'kind',
              header: 'Type',
              sortValue: (item) => kindLabels[item.kind],
              cell: (item) => <Badge tone={item.tone}>{kindLabels[item.kind]}</Badge>,
            },
            {
              id: 'at',
              header: 'When',
              sortValue: (item) => new Date(item.at),
              csv: (item) => item.at,
              cell: (item) => (
                <span className="whitespace-nowrap text-fg-subtle tnum">
                  {formatRelative(item.at)}
                </span>
              ),
            },
            {
              id: 'actions',
              header: <span className="sr-only">Actions</span>,
              label: 'Actions',
              hideable: false,
              align: 'right',
              cell: (item) => (
                <span
                  className="flex items-center justify-end gap-1"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button asChild size="sm" variant="soft">
                    <Link href={item.href}>{item.action}</Link>
                  </Button>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label={
                      done.has(item.key)
                        ? `Move ${item.title} back to To do`
                        : `Mark ${item.title} as done`
                    }
                    onClick={() => mark([item.key], !done.has(item.key))}
                  >
                    {done.has(item.key) ? <RotateCcw /> : <Check />}
                  </IconButton>
                </span>
              ),
            },
          ]}
        />
        {stalledTotal > stalledShown && (kind === 'all' || kind === 'stalled') && (
          <p className="border-t border-border-subtle px-1 py-3 text-sm text-fg-subtle">
            {stalledTotal - stalledShown} more applications have had no activity for a while.{' '}
            <Link href="/candidates" className="text-accent-foreground hover:underline">
              View candidates
            </Link>
          </p>
        )}
      </Card>
    </>
  );
}
