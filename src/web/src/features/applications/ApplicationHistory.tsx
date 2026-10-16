'use client';

import type { ReactNode } from 'react';
import { Badge, Paper, Text, Timeline } from '@mantine/core';
import { IconClock, IconMail, IconMessage } from '@tabler/icons-react';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime, humanize } from '@/lib/format';
import { LoadError } from './application-data';
import { useApplicationExtras } from './application-extras';

const ACTIONS: Record<string, string> = {
  OfferDrafted: 'Acceptance started',
  OfferSubmitted: 'Acceptance submitted for approval',
  OfferWithdrawn: 'Acceptance withdrawn',
  ApprovalGiven: 'Approval given',
  ApprovalRejected: 'Approval rejected',
  AcceptanceSent: 'Acceptance email sent',
  AcceptanceReversed: 'Acceptance reversed',
  MessageSent: 'Message sent to the candidate',
  WithdrawnByCandidate: 'Candidate withdrew their application',
  InterviewCancelledExternally: 'Interview cancelled from the calendar',
  StageChanged: 'Stage changed',
  BulkStageChanged: 'Stage changed (several applicants at once)',
  NoteAdded: 'Review note added',
  InterviewScheduled: 'Interview scheduled',
  InterviewUpdated: 'Interview updated',
  ScorecardSubmitted: 'Scorecard submitted',
  MeetingNotesUpdated: 'Meeting notes updated',
  FailedDeliveryRetried: 'Failed email retried',
  CandidateDismissed: 'Candidate dismissed',
  Created: 'Application created',
};

const DELIVERY: Record<string, { label: string; color: string }> = {
  sent: { label: 'Sent', color: 'gray' },
  delivered: { label: 'Delivered', color: 'teal' },
  opened: { label: 'Opened', color: 'teal' },
  bounced: { label: 'Bounced', color: 'red' },
  complained: { label: 'Marked as spam', color: 'red' },
};

function emailBadge(status: string, delivery?: string | null) {
  if (status === 'Failed') return { label: 'Failed to send', color: 'red' };
  if (delivery && DELIVERY[delivery.toLowerCase()]) return DELIVERY[delivery.toLowerCase()];
  return status === 'Succeeded' ? DELIVERY.sent : { label: 'Waiting to send', color: 'gray' };
}

type Item = { key: string; at: string; icon: ReactNode; title: ReactNode; body: ReactNode };

export function ApplicationHistory({ id }: { id: string }) {
  const { query, emails, messages } = useApplicationExtras(id);
  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={3} />;

  const items: Item[] = [
    // The message itself is listed below, so skip its audit twin.
    ...query.data.audit
      .filter((event) => event.action !== 'MessageSent')
      .map((event) => ({
        key: `a${event.id}`,
        at: event.occurredAt,
        icon: <IconClock size={14} />,
        title: ACTIONS[event.action] ?? humanize(event.action),
        body: (
          <Text c="dimmed" size="sm">
            {event.actorEmail}
          </Text>
        ),
      })),
    ...emails.map((email) => {
      const badge = emailBadge(email.status, email.deliveryStatus);
      return {
        key: `e${email.id}`,
        at: email.createdAt,
        icon: <IconMail size={14} />,
        title: (
          <>
            Email: {email.subject}{' '}
            <Badge variant="light" color={badge.color} ml={4}>
              {badge.label}
            </Badge>
          </>
        ),
        body: (
          <Text c="dimmed" size="sm">
            To {email.recipient}
          </Text>
        ),
      };
    }),
    ...messages.map((message) => ({
      key: `m${message.id}`,
      at: message.createdAt,
      icon: <IconMessage size={14} />,
      title: message.fromCandidate ? 'Message from the candidate' : 'Message to the candidate',
      body: (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {message.body}
        </Text>
      ),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0)
    return (
      <EmptyState
        icon={IconClock}
        title="No recorded history yet"
        description="Stage changes, notes, emails, messages and interview decisions appear here as they happen."
      />
    );
  return (
    <Paper withBorder radius="lg" p="xl">
      <Timeline bulletSize={26} lineWidth={2}>
        {items.map((item) => (
          <Timeline.Item key={item.key} bullet={item.icon} title={item.title}>
            {item.body}
            <Text size="xs" mt={4}>
              {formatDateTime(item.at)}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
}
