'use client';

import { useState, type ReactNode } from 'react';
import { Clock, History, Mail, MessageSquare } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SkeletonRows,
  Timeline,
  type Tone,
} from '@/components/ui';
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

const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  sent: { label: 'Sent', tone: 'gray' },
  delivered: { label: 'Delivered', tone: 'green' },
  opened: { label: 'Opened', tone: 'green' },
  bounced: { label: 'Bounced', tone: 'red' },
  complained: { label: 'Marked as spam', tone: 'red' },
};

function emailBadge(status: string, delivery?: string | null): { label: string; tone: Tone } {
  if (status === 'Failed') return { label: 'Failed to send', tone: 'red' };
  if (delivery && DELIVERY[delivery.toLowerCase()]) return DELIVERY[delivery.toLowerCase()];
  return status === 'Succeeded' ? DELIVERY.sent : { label: 'Waiting to send', tone: 'gray' };
}

type Item = { key: string; at: string; icon: ReactNode; title: ReactNode; body: ReactNode };

export function ApplicationHistory({ id }: { id: string }) {
  const { query, emails, messages } = useApplicationExtras(id);
  const [showAll, setShowAll] = useState(false);
  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );

  const items: Item[] = [
    // The message itself is listed below, so skip its audit twin.
    ...query.data.audit
      .filter((event) => event.action !== 'MessageSent')
      .map((event) => ({
        key: `a${event.id}`,
        at: event.occurredAt,
        icon: <Clock />,
        title: ACTIONS[event.action] ?? humanize(event.action),
        body: event.actorEmail,
      })),
    ...emails.map((email) => {
      const badge = emailBadge(email.status, email.deliveryStatus);
      return {
        key: `e${email.id}`,
        at: email.createdAt,
        icon: <Mail />,
        title: (
          <span className="inline-flex flex-wrap items-center gap-2">
            Email: {email.subject}
            <Badge tone={badge.tone} size="sm">
              {badge.label}
            </Badge>
          </span>
        ),
        body: `To ${email.recipient}`,
      };
    }),
    ...messages.map((message) => ({
      key: `m${message.id}`,
      at: message.createdAt,
      icon: <MessageSquare />,
      title: message.fromCandidate ? 'Message from the candidate' : 'Message to the candidate',
      body: <p className="whitespace-pre-wrap text-fg">{message.body}</p>,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0)
    return (
      <Card>
        <EmptyState
          icon={History}
          title="No activity yet"
          description="Stage changes, emails, messages and decisions appear here as they happen."
        />
      </Card>
    );
  const shown = showAll ? items : items.slice(0, 6);
  return (
    <Card>
      <CardHeader
        title="Activity"
        action={
          <span className="text-sm text-fg-subtle tnum">
            {items.length} {items.length === 1 ? 'event' : 'events'}
          </span>
        }
      />
      <CardBody className="pt-2">
        <Timeline
          items={shown.map((item) => ({
            id: item.key,
            icon: item.icon,
            title: item.title,
            meta: formatDateTime(item.at),
            body: item.body,
          }))}
        />
        {items.length > shown.length && (
          <Button variant="quiet" size="sm" className="mt-3" onClick={() => setShowAll(true)}>
            Show all {items.length} events
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
