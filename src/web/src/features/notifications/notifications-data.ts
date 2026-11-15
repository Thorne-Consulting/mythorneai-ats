'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  AtSign,
  BellRing,
  CalendarClock,
  ClipboardCheck,
  ClockAlert,
  FileSignature,
  Inbox,
  MessageCircle,
  PencilLine,
  Upload,
  UserCheck,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/api';
import type { Tone } from '@/components/ui';
import { useHubEvent } from '@/features/messages/live';

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  href: string;
  createdAt: string;
  readAt?: string | null;
  actorName?: string | null;
}

type Page = { items: AppNotification[]; nextCursor: string | null };

/** Icon and colour per kind. Unknown kinds (added on the server later) get the bell. */
export const kindLook: Record<string, { icon: LucideIcon; tone: Tone }> = {
  'candidate-message': { icon: MessageCircle, tone: 'violet' },
  mention: { icon: AtSign, tone: 'blue' },
  assigned: { icon: UserCheck, tone: 'blue' },
  'approval-requested': { icon: ClipboardCheck, tone: 'amber' },
  'approval-decided': { icon: ClipboardCheck, tone: 'green' },
  'approval-stuck': { icon: ClockAlert, tone: 'red' },
  'scorecard-due': { icon: PencilLine, tone: 'blue' },
  'interview-soon': { icon: CalendarClock, tone: 'blue' },
  'offer-response': { icon: FileSignature, tone: 'amber' },
  'import-finished': { icon: Upload, tone: 'green' },
  stalled: { icon: ClockAlert, tone: 'gray' },
  'snooze-ended': { icon: Inbox, tone: 'gray' },
  'candidate-withdrew': { icon: UserMinus, tone: 'red' },
};
export const lookOf = (kind: string) => kindLook[kind] ?? { icon: BellRing, tone: 'gray' as Tone };

export function useNotificationFeed(status: 'unread' | 'all', limit = 30) {
  return useInfiniteQuery({
    queryKey: ['notifications', status, limit],
    queryFn: ({ pageParam }) =>
      api.get<Page>(
        `/api/notifications?status=${status}&limit=${limit}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const flattenFeed = (data: InfiniteData<Page> | undefined) =>
  (data?.pages ?? []).flatMap((p) => p.items);

/** The unread count for the bell, kept live over the hub and refreshed every minute as a fallback. */
export function useNotificationCount() {
  const client = useQueryClient();
  useHubEvent('notificationsChanged', () => {
    client.invalidateQueries({ queryKey: ['notifications'] });
    client.invalidateQueries({ queryKey: ['notification-count'] });
  });
  return useQuery({
    queryKey: ['notification-count'],
    queryFn: () => api.get<{ unread: number }>('/api/notifications/count'),
    refetchInterval: 60_000,
  });
}

export function useMarkNotifications() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean; read?: boolean }) =>
      api.post('/api/notifications/read', { read: true, ...input }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['notifications'] });
      client.invalidateQueries({ queryKey: ['notification-count'] });
    },
  });
}
