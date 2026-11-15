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
  Scheduled: 'blue',
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

/** What a stage means, whatever the company calls it (`PipelineStage.Type` on the server). */
export type StageType = 'Applied' | 'Screen' | 'Interview' | 'Offer' | 'Hired' | 'Other';

/** The stage types in pipeline order, with plain names for pickers. */
export const stageTypes: { value: StageType; label: string; description: string }[] = [
  { value: 'Applied', label: 'New', description: 'People who just applied or were added' },
  { value: 'Screen', label: 'Screening', description: 'Reviews and screening calls' },
  {
    value: 'Interview',
    label: 'Interview',
    description: 'Interviews; booking one moves people here',
  },
  { value: 'Offer', label: 'Offer', description: 'Making and agreeing an offer' },
  { value: 'Hired', label: 'Hired', description: 'Reached only through an accepted offer' },
  { value: 'Other', label: 'Other', description: 'Anything else, for example a task' },
];

const stageTypeTones: Record<string, Tone> = {
  Applied: 'gray',
  Screen: 'violet',
  Interview: 'blue',
  Offer: 'amber',
  Hired: 'green',
  Other: 'gray',
};
const toneNames = new Set<string>(['blue', 'violet', 'green', 'amber', 'red', 'gray']);

/**
 * A stage's colour: its stored colour when it is one of our tones, else its type's colour
 * (the server mirrors this in `StageRules.Tone`). Never guessed from the stage's name.
 */
export function stageTone(type?: string | null, color?: string | null): Tone {
  if (color && toneNames.has(color)) return color as Tone;
  return (type && stageTypeTones[type]) || 'gray';
}

/** Words for statuses where splitting the code name is not plain enough. */
const statusLabels: Record<string, string> = {
  NoShow: 'Did not attend',
  PendingApproval: 'Waiting for approval',
  InReview: 'In review',
  OnHold: 'On hold',
};
export const statusLabel = (status: string) => statusLabels[status] ?? humanize(status);

export function StatusBadge({ status, size }: { status: string; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={statusTones[status] ?? 'gray'} dot size={size}>
      {statusLabel(status)}
    </Badge>
  );
}

/**
 * A stage's name in its colour. Pass the stage's `type` (and `color`) for the right colour;
 * without them the badge is grey.
 */
export function StageBadge({
  stage,
  type,
  color,
  size,
}: {
  stage: string;
  type?: string | null;
  color?: string | null;
  size?: 'sm' | 'md';
}) {
  return (
    <Badge tone={stageTone(type, color)} dot size={size}>
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
