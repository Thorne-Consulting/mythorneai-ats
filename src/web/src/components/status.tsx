import { Badge, type Tone } from '@/components/ui';
import { humanize } from '@/lib/format';

/**
 * One place that decides colours for statuses and stages, so "Open" is green and "Interview"
 * is blue on every screen. Unknown values fall back to grey.
 */
export const statusTones: Record<string, Tone> = {
  // jobs
  Open: 'green',
  Active: 'green',
  Draft: 'gray',
  PendingApproval: 'amber',
  OnHold: 'amber',
  Paused: 'amber',
  Filled: 'blue',
  Closed: 'gray',
  Cancelled: 'red',
  // applications, offers, approvals, interviews
  Accepted: 'green',
  Hired: 'green',
  Approved: 'green',
  Passed: 'green',
  Completed: 'green',
  Confirmed: 'green',
  Sent: 'blue',
  Scheduled: 'violet',
  InReview: 'amber',
  Review: 'amber',
  Pending: 'amber',
  Rejected: 'red',
  Declined: 'red',
  Failed: 'red',
  NoShow: 'red',
  Withdrawn: 'gray',
  Expired: 'gray',
};

const recommendationTones: Record<string, Tone> = {
  StrongYes: 'green',
  Yes: 'green',
  Mixed: 'amber',
  No: 'red',
  StrongNo: 'red',
};

/** Pipeline stages are named by each company, so match on keywords. */
export function stageTone(stage: string): Tone {
  const s = stage.toLowerCase();
  if (/(hire|hired|start|onboard)/.test(s)) return 'green';
  if (/(offer)/.test(s)) return 'amber';
  if (/(interview|technical|panel|onsite|final)/.test(s)) return 'blue';
  if (/(screen|phone|review|assess)/.test(s)) return 'violet';
  if (/(reject|declin|withdr|archiv)/.test(s)) return 'red';
  return 'gray';
}

export function StatusBadge({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={statusTones[status] ?? 'gray'} dot size={size}>
      {humanize(status)}
    </Badge>
  );
}

export function StageBadge({ stage, size }: { stage: string; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={stageTone(stage)} dot size={size}>
      {stage}
    </Badge>
  );
}

export function RecommendationBadge({ recommendation }: { recommendation: string }) {
  return (
    <Badge tone={recommendationTones[recommendation] ?? 'gray'} dot>
      {humanize(recommendation)}
    </Badge>
  );
}
