import {
  ClipboardCheck,
  ClockAlert,
  MessageCircle,
  PencilLine,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/ui';
import type { PendingApproval } from '@/features/approvals/approval-data';
import { formatRelative } from '@/lib/format';
import { useLocalStorageState } from '@/lib/hooks';
import type { DashboardData } from '@/types';

export type NotificationKind = 'approval' | 'feedback' | 'message' | 'stalled';

export type NotificationItem = {
  /** Changes when the underlying thing changes (a new message), so "done" doesn't hide it. */
  key: string;
  kind: NotificationKind;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  href: string;
  action: string;
  at: string;
};

export const kindLabels: Record<NotificationKind, string> = {
  approval: 'Approvals',
  feedback: 'Feedback due',
  message: 'Messages',
  stalled: 'No activity',
};

/**
 * Everything waiting on the signed-in user, from the dashboard and approvals endpoints. Ordered by
 * what blocks someone else first: a decision, then feedback, then a person waiting on a reply,
 * then work that has gone quiet.
 */
export function buildNotifications(
  data: DashboardData | undefined,
  approvals: PendingApproval[] | undefined,
): NotificationItem[] {
  return [
    ...(approvals ?? []).map((item) => ({
      key: `a-${item.id}`,
      kind: 'approval' as const,
      icon: ClipboardCheck,
      tone: 'amber' as Tone,
      title: item.title,
      meta: `${item.detail} · asked by ${item.requestedByName}`,
      href: '/approvals',
      action: 'Decide',
      at: item.createdAt,
    })),
    ...(data?.scorecardsDue ?? []).map((item) => ({
      key: `s-${item.id}`,
      kind: 'feedback' as const,
      icon: PencilLine,
      tone: 'blue' as Tone,
      title: `Scorecard for ${item.candidateName}`,
      meta: `${item.title} · ended ${formatRelative(item.endsAt)}`,
      href: `/applications/${item.applicationId}/interviews?scorecard=${item.id}`,
      action: 'Write',
      at: item.endsAt,
    })),
    ...(data?.unreadMessages ?? []).map((item) => ({
      key: `m-${item.applicationId}-${item.at}`,
      kind: 'message' as const,
      icon: MessageCircle,
      tone: 'violet' as Tone,
      title: `${item.candidateName} wrote`,
      meta: `“${item.preview.slice(0, 80)}${item.preview.length > 80 ? '…' : ''}” · ${item.requisitionTitle}`,
      href: `/applications/${item.applicationId}`,
      action: 'Reply',
      at: item.at,
    })),
    ...(data?.stalled ?? []).map((item) => ({
      key: `q-${item.applicationId}-${item.lastActivityAt}`,
      kind: 'stalled' as const,
      icon: ClockAlert,
      tone: 'gray' as Tone,
      title: `${item.candidateName}, stuck in ${item.stage}`,
      meta: `${item.requisitionTitle} · nothing has happened for ${formatRelative(item.lastActivityAt).replace(' ago', '')}`,
      href: `/applications/${item.applicationId}`,
      action: 'Open',
      at: item.lastActivityAt,
    })),
  ];
}

/** Items the user has ticked off, per browser. Keys change when the item does, so news comes back. */
export function useDoneNotifications() {
  const [done, setDone] = useLocalStorageState<string[]>('ats-notifications-done', []);
  return [new Set(done), setDone] as const;
}
