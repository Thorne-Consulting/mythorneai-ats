import { Badge, Box } from '@mantine/core';
import { humanize } from '@/lib/format';

const statusColors: Record<string, string> = {
  Open: 'teal',
  Active: 'teal',
  Accepted: 'teal',
  Hired: 'teal',
  Approved: 'blue',
  Sent: 'blue',
  Scheduled: 'violet',
  Draft: 'gray',
  OnHold: 'yellow',
  Rejected: 'red',
  Declined: 'red',
  Cancelled: 'red',
  Withdrawn: 'gray',
  Closed: 'gray',
  Filled: 'indigo',
};

const recommendationColors: Record<string, string> = {
  StrongYes: 'teal',
  Yes: 'teal',
  Mixed: 'yellow',
  No: 'red',
  StrongNo: 'red',
};

export function StatusBadge({ status, size }: { status: string; size?: string }) {
  const color = statusColors[status] ?? 'gray';
  return (
    <Badge
      variant="default"
      size={size}
      leftSection={<Box className="status-dot" bg={`${color}.6`} />}
    >
      {humanize(status)}
    </Badge>
  );
}

export function StageBadge({ stage, size = 'sm' }: { stage: string; size?: string }) {
  return (
    <Badge variant="default" size={size} fw={600}>
      {stage}
    </Badge>
  );
}

export function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const color = recommendationColors[recommendation] ?? 'gray';
  return (
    <Badge variant="default" leftSection={<Box className="status-dot" bg={`${color}.6`} />}>
      {humanize(recommendation)}
    </Badge>
  );
}
