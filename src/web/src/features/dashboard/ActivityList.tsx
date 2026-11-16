'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  PencilLine,
  RotateCcw,
  Trophy,
  UserPlus,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/api';
import { IconDisc, SkeletonRows, type Tone } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { activityText, type Activity } from './activity-text';

const activityLook: Record<Activity['verb'], { icon: LucideIcon; tone: Tone }> = {
  applied: { icon: UserPlus, tone: 'gray' },
  added: { icon: UserPlus, tone: 'gray' },
  moved: { icon: ArrowRight, tone: 'blue' },
  rejected: { icon: UserX, tone: 'red' },
  withdrew: { icon: UserX, tone: 'gray' },
  hired: { icon: Trophy, tone: 'green' },
  reopened: { icon: RotateCcw, tone: 'violet' },
  scored: { icon: PencilLine, tone: 'amber' },
};

/** The latest moves, rejections, hires, applications and scorecards, for my jobs or everyone's. */
export function ActivityList({
  scope = 'all',
  requisitionId,
  take = 10,
  showJob = true,
}: {
  scope?: 'mine' | 'all';
  requisitionId?: string;
  take?: number;
  showJob?: boolean;
}) {
  const activity = useQuery({
    queryKey: ['activity', scope, requisitionId ?? '', take],
    queryFn: () =>
      api.get<Activity[]>(
        `/api/activity?scope=${scope}&take=${take}${requisitionId ? `&requisitionId=${requisitionId}` : ''}`,
      ),
  });
  if (!activity.data) return <SkeletonRows rows={4} />;
  if (activity.data.length === 0)
    return (
      <p className="px-5 pb-5 text-sm text-fg-subtle">
        Nothing yet. Moves, new applications and feedback show up here.
      </p>
    );
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {activity.data.map((item, index) => {
        const look = activityLook[item.verb];
        return (
          <li key={`${item.applicationId}-${item.at}-${index}`}>
            <Link
              href={`/applications/${item.applicationId}`}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted"
            >
              <IconDisc icon={look.icon} tone={look.tone} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">{activityText(item)}</span>
                <span className="block truncate text-2xs text-fg-subtle">
                  {showJob ? `${item.jobTitle} · ` : ''}
                  {formatRelative(item.at)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
