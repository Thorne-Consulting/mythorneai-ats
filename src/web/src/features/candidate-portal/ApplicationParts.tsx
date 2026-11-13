'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Video } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Modal,
  Textarea,
  Timeline,
  toast,
  type TimelineEntry,
} from '@/components/ui';
import { ChatBubble } from '@/components/messages/Chat';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { usePortal } from './PortalProvider';
import { statusSteps, timeOnly, when, type PortalApplication, type Slot } from './portal';

export function StatusCard({ application }: { application: PortalApplication }) {
  const items: TimelineEntry[] = statusSteps(application).map((step) => ({
    id: step.id,
    title: step.state === 'todo' ? <span className="text-fg-muted">{step.title}</span> : step.title,
    tone:
      step.state === 'done'
        ? 'green'
        : step.state === 'current'
          ? 'blue'
          : step.state === 'final' && step.positive
            ? 'green'
            : 'gray',
    meta:
      step.id === 'applied'
        ? `Done · ${formatDate(application.appliedAt)}`
        : step.state === 'done'
          ? 'Done'
          : step.state === 'current'
            ? `Now · last update ${formatRelative(application.lastActivityAt)}`
            : step.state === 'final'
              ? formatDate(application.lastActivityAt)
              : 'Coming up',
  }));
  return (
    <Card>
      <CardHeader
        title="Where things stand"
        description="Each step of your application, in order."
      />
      <CardBody>
        <Timeline items={items} />
      </CardBody>
    </Card>
  );
}

export function Interviews({
  application,
  title = 'Interviews',
}: {
  application: PortalApplication;
  /** Card title; the portal-wide Interviews page passes the job title. */
  title?: React.ReactNode;
}) {
  const { call, reload } = usePortal();
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({});
  const [cancel, setCancel] = useState<{ id: string; title: string } | null>(null);

  async function loadAvailability(interviewId: string) {
    const { ok, response } = await call(
      `/public/applications/${application.id}/interviews/${interviewId}/availability`,
      undefined,
      'We could not load current availability.',
    );
    if (!ok || !response) return;
    const result = await response.json();
    setAvailability((current) => ({ ...current, [interviewId]: result.slots ?? [] }));
  }

  async function book(interviewId: string, slot: Slot, verb: 'book' | 'reschedule') {
    const { ok } = await call(
      `/public/applications/${application.id}/interviews/${interviewId}/${verb}`,
      slot,
      'That time is no longer available. Please pick another.',
    );
    if (!ok) return;
    setAvailability((current) => {
      const { [interviewId]: _, ...rest } = current;
      return rest;
    });
    toast.success(verb === 'book' ? 'Your interview is booked' : 'Your interview time was changed');
    await reload();
  }

  const none = application.proposedInterviews.length === 0 && application.interviews.length === 0;
  return (
    <Card id="interviews" className="scroll-mt-6">
      <CardHeader title={title} />
      <CardBody className="flex flex-col gap-3">
        {none && (
          <p className="text-sm text-fg-subtle">
            No interviews yet. When the team proposes times, you will pick one here.
          </p>
        )}

        {application.proposedInterviews.map((interview) => (
          <section
            key={interview.id}
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-muted p-4"
          >
            <p className="flex items-center gap-2 text-base font-medium text-fg">
              <CalendarClock className="size-4 text-tone-blue-dot" aria-hidden />
              {interview.title}: pick a time
            </p>
            <Button
              variant="soft"
              fullWidth
              className="h-auto min-h-[38px] py-2 whitespace-normal"
              onClick={() =>
                book(
                  interview.id,
                  { startsAt: interview.startsAt, endsAt: interview.endsAt },
                  'book',
                )
              }
            >
              Book {when(interview.startsAt)}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              className="self-start"
              onClick={() => loadAvailability(interview.id)}
            >
              Find another time
            </Button>
            <Slots
              slots={availability[interview.id]}
              onPick={(slot) => book(interview.id, slot, 'book')}
            />
          </section>
        ))}

        {application.interviews.map((interview) => (
          <section
            key={interview.id}
            className="flex flex-col gap-2 rounded-lg border border-border-subtle p-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="flex-1 text-base text-fg">
                <span className="font-medium">{interview.title}</span>
                <span className="text-fg-muted">: {when(interview.startsAt)}</span>
              </p>
              <Badge tone="blue">Booked</Badge>
              {interview.meetingLink && (
                <Button asChild variant="secondary" size="sm">
                  <a href={interview.meetingLink} target="_blank" rel="noreferrer">
                    <Video /> Join meeting
                  </a>
                </Button>
              )}
            </div>
            {application.canReschedule && (
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" size="sm" onClick={() => loadAvailability(interview.id)}>
                  Change time
                </Button>
                <Button
                  variant="danger-quiet"
                  size="sm"
                  onClick={() => setCancel({ id: interview.id, title: interview.title })}
                >
                  Cancel interview
                </Button>
              </div>
            )}
            <Slots
              slots={availability[interview.id]}
              onPick={(slot) => book(interview.id, slot, 'reschedule')}
            />
          </section>
        ))}
      </CardBody>

      <ConfirmDialog
        opened={cancel !== null}
        onClose={() => setCancel(null)}
        title="Cancel this interview?"
        message={`${cancel?.title ?? 'The interview'} will be cancelled and the team will be told. To pick a new time instead, choose Change time.`}
        confirmLabel="Cancel interview"
        onConfirm={async () => {
          if (!cancel) return;
          const { ok } = await call(
            `/public/applications/${application.id}/interviews/${cancel.id}/cancel`,
            undefined,
            'That interview could not be cancelled.',
          );
          if (ok) toast.success('Your interview was cancelled');
          await reload();
        }}
      />
    </Card>
  );
}

export function Slots({ slots, onPick }: { slots?: Slot[]; onPick: (slot: Slot) => void }) {
  if (!slots) return null;
  if (slots.length === 0)
    return (
      <p className="text-sm text-fg-subtle">
        There are no other times open right now. Message the team and they will help.
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {slots.map((slot) => (
        <Button
          key={slot.startsAt}
          variant="secondary"
          fullWidth
          className="h-auto min-h-[38px] py-2 whitespace-normal"
          onClick={() => onPick(slot)}
        >
          {when(slot.startsAt)} – {timeOnly(slot.endsAt)}
        </Button>
      ))}
    </div>
  );
}

export function Thread({ application }: { application: PortalApplication }) {
  const { call, reload } = usePortal();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const marked = useRef(false);
  const unread = application.thread.filter((item) => item.unread).length;

  // Showing the thread counts as reading it.
  useEffect(() => {
    if (unread === 0 || marked.current) return;
    marked.current = true;
    call(`/public/portal/applications/${application.id}/messages/read`).then(() => {
      marked.current = false;
      // Keep the "new" marker visible this once; it clears on the next refresh.
    });
  }, [unread, application.id, call]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    const { ok } = await call(
      `/public/portal/applications/${application.id}/messages`,
      { body: body.trim() },
      'Your message was not sent. Please try again.',
    );
    setSending(false);
    if (!ok) return;
    setBody('');
    toast.success('Message sent', 'The team will reply here and by email.');
    await reload();
  }

  return (
    <section className="flex flex-col gap-3" aria-label={`Messages about ${application.jobTitle}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-fg">Messages with the hiring team</h2>
        {unread > 0 && <Badge tone="blue">{unread} new</Badge>}
      </div>
      {application.thread.length === 0 && (
        <p className="text-sm text-fg-subtle">
          No messages yet. Questions about this role? Write to the team below.
        </p>
      )}
      {application.thread.map((item) => (
        <ChatBubble
          key={item.id}
          direction={item.fromCandidate ? 'out' : 'in'}
          time={`${item.fromCandidate ? 'You' : 'Hiring team'} · ${formatDateTime(item.createdAt)}${item.unread ? ' · new' : ''}`}
        >
          {item.body}
        </ChatBubble>
      ))}
      <form onSubmit={send} className="flex flex-col gap-2">
        <Textarea
          aria-label="Write a message to the hiring team"
          placeholder="Write a message…"
          minRows={2}
          maxLength={2000}
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-subtle tnum">{body.length}/2000</span>
          <Button type="submit" loading={sending} disabled={!body.trim()}>
            Send message
          </Button>
        </div>
      </form>
    </section>
  );
}

export function Withdraw({ application }: { application: PortalApplication }) {
  const { call, reload } = usePortal();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setBusy(true);
    const { ok } = await call(
      `/public/portal/applications/${application.id}/withdraw`,
      { reason: reason.trim() || null },
      'We could not withdraw your application.',
    );
    if (ok) toast.success('Your application was withdrawn', 'We have emailed you a confirmation.');
    setBusy(false);
    setOpen(false);
    setReason('');
    await reload();
  }

  return (
    <Card>
      <CardHeader
        title="Changed your mind?"
        description="You can withdraw this application at any time."
      />
      <CardBody>
        <Button variant="danger-quiet" size="sm" onClick={() => setOpen(true)}>
          Withdraw application
        </Button>
      </CardBody>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        dismissable={!busy}
        title="Withdraw your application?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Keep my application
            </Button>
            <Button variant="danger" loading={busy} onClick={withdraw}>
              Withdraw application
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-fg-muted">
            This ends your application for {application.jobTitle}. Any interviews you have booked
            are cancelled, the team is told, and we email you a confirmation. You can apply again in
            the future.
          </p>
          <Textarea
            label="Anything you would like the team to know? (optional)"
            minRows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </div>
      </Modal>
    </Card>
  );
}

/** Copies of the emails the team sent about this application. */
export function EmailsList({
  application,
  showJob,
}: {
  application: PortalApplication;
  showJob?: boolean;
}) {
  if (application.messages.length === 0)
    return <p className="text-sm text-fg-subtle">No emails about this application yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {application.messages.map((item) => (
        <article
          key={`${item.createdAt}-${item.subject}`}
          className="rounded-lg border border-border-subtle p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base font-medium text-fg">{item.subject}</p>
            <p className="text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</p>
          </div>
          {showJob && <p className="text-xs text-fg-subtle">{application.jobTitle}</p>}
          <p className="mt-2 text-sm whitespace-pre-wrap text-fg-muted">{item.body}</p>
        </article>
      ))}
    </div>
  );
}
