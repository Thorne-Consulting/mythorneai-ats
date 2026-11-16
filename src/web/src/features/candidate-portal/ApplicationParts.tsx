'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronDown, Mail, Paperclip, Video } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  FileButton,
  Modal,
  Textarea,
  Timeline,
  toast,
  type TimelineEntry,
} from '@/components/ui';
import { ChatBubble, FileCard, MessageBody } from '@/components/messages/Chat';
import { RichText } from '@/components/rich-text';
import { SlotPicker } from '@/components/scheduling/SlotPicker';
import {
  dayKey,
  dayLabel as zonedDay,
  timeLabel,
  zoneLongName,
} from '@/components/scheduling/time';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import { useThreadTyping } from './live';
import { usePortal } from './PortalProvider';
import {
  dayLabel,
  statusSteps,
  threadItems,
  timeOnly,
  timeRange,
  when,
  type PortalApplication,
  type PortalEmail,
  type Slot,
  documentHref,
  fileSize,
} from './portal';

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
      <CardHeader title="Where things stand" />
      <CardBody>
        <Timeline items={items} />
      </CardBody>
    </Card>
  );
}

export function Interviews({
  application,
  title,
}: {
  application: PortalApplication;
  /** Card title, used on the Interviews page to name the job. The application tab has none. */
  title?: React.ReactNode;
}) {
  const { call, reload } = usePortal();
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({});
  const [cancel, setCancel] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState('');
  // Changing a booked time: the shared day-and-time picker, in the candidate's own zone.
  const [moving, setMoving] = useState<{ id: string; title: string } | null>(null);
  const [movingSlots, setMovingSlots] = useState<Slot[] | null>(null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [busy, setBusy] = useState(false);
  // Scheduling links the team sent: each opens the no-sign-in booking page.
  const [links, setLinks] = useState<
    { title: string; durationMinutes: number; status: string; path: string }[]
  >([]);
  useEffect(() => {
    let live = true;
    fetch(`/public/applications/${application.id}/scheduling-links`)
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => live && setLinks(rows))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [application.id]);

  async function loadAvailability(interviewId: string) {
    const { ok, response } = await call(
      `/public/applications/${application.id}/interviews/${interviewId}/availability`,
      undefined,
      'We could not load other times. Please try again.',
    );
    if (!ok || !response) return;
    const result = await response.json();
    setAvailability((current) => ({ ...current, [interviewId]: result.slots ?? [] }));
  }

  async function startMove(interview: { id: string; title: string }) {
    setMoving(interview);
    setChosen(null);
    setMovingSlots(null);
    const { ok, response } = await call(
      `/public/applications/${application.id}/interviews/${interview.id}/availability`,
      undefined,
      'We could not load other times. Please try again.',
    );
    setMovingSlots(ok && response ? ((await response.json()).slots ?? []) : []);
  }

  async function move() {
    if (!moving || !chosen) return;
    setBusy(true);
    const { ok } = await call(
      `/public/applications/${application.id}/interviews/${moving.id}/reschedule`,
      chosen,
      'That time is no longer available. Please pick another.',
    );
    setBusy(false);
    if (!ok) {
      setChosen(null);
      return startMove(moving);
    }
    setMoving(null);
    toast.success('Your interview time was changed');
    await reload();
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

  const openLinks = links.filter((link) => link.status === 'Open');
  const none =
    application.proposedInterviews.length === 0 &&
    application.interviews.length === 0 &&
    openLinks.length === 0;
  return (
    <Card id="interviews" className="scroll-mt-6">
      {title && <CardHeader title={title} />}
      <CardBody className={title ? 'flex flex-col gap-3' : 'flex flex-col gap-3 pt-5'}>
        {none && (
          <p className="text-sm text-fg-subtle">
            No interviews yet. When the team suggests times, you can pick one here.
          </p>
        )}

        {openLinks.map((link) => (
          <section
            key={link.path}
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-muted p-4"
          >
            <p className="flex items-center gap-2 text-base font-medium text-fg">
              <CalendarClock className="size-4 text-tone-blue-dot" aria-hidden />
              {link.title}: pick a time
            </p>
            <p className="text-sm text-fg-muted">
              {link.durationMinutes} minutes. Choose a day and time that suit you.
            </p>
            <Button asChild variant="soft" className="self-start">
              <Link href={link.path}>Choose a time</Link>
            </Button>
          </section>
        ))}

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

        {application.interviews.map((interview) => {
          const meetingUrl = safeWebUrl(interview.meetingLink);
          return (
            <section
              key={interview.id}
              className="flex flex-col gap-3 rounded-lg border border-border-subtle p-4"
            >
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-fg">{interview.title}</p>
                  <p className="text-sm text-fg-muted">
                    {dayLabel(interview.startsAt)},{' '}
                    {timeRange(interview.startsAt, interview.endsAt)}
                  </p>
                </div>
                {meetingUrl && (
                  <Button asChild variant="secondary" size="sm">
                    <a href={meetingUrl} target="_blank" rel="noreferrer">
                      <Video /> Join meeting
                    </a>
                  </Button>
                )}
              </div>
              {application.canReschedule && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => startMove({ id: interview.id, title: interview.title })}
                  >
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
            </section>
          );
        })}
      </CardBody>

      <Modal
        opened={moving !== null}
        onClose={() => setMoving(null)}
        dismissable={!busy}
        size="lg"
        title={`New time for ${moving?.title ?? 'your interview'}`}
        description="Times show in your time zone. The team is told when you change it."
        footer={
          chosen && (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setChosen(null)}>
                Pick another time
              </Button>
              <Button loading={busy} onClick={move}>
                Move to this time
              </Button>
            </>
          )
        }
      >
        {chosen ? (
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-fg-subtle">You picked</p>
            <p className="mt-1 text-lg font-semibold text-fg">
              {zonedDay(dayKey(chosen.startsAt, zone))}, {timeLabel(chosen.startsAt, zone)} –{' '}
              {timeLabel(chosen.endsAt, zone)}
            </p>
            <p className="text-sm text-fg-muted">{zoneLongName(zone, new Date(chosen.startsAt))}</p>
          </div>
        ) : (
          <SlotPicker
            slots={movingSlots ?? []}
            loading={movingSlots === null}
            timeZone={zone}
            onTimeZoneChange={setZone}
            value={null}
            onChange={setChosen}
          />
        )}
      </Modal>

      <Modal
        opened={cancel !== null}
        onClose={() => setCancel(null)}
        dismissable={!busy}
        title="Cancel this interview?"
        description={`${cancel?.title ?? 'The interview'} will be cancelled and the team will be told. To pick a new time instead, choose Change time.`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setCancel(null)}>
              Keep my interview
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!cancel) return;
                setBusy(true);
                const { ok } = await call(
                  `/public/applications/${application.id}/interviews/${cancel.id}/cancel`,
                  { reason: reason.trim() || null },
                  'We could not cancel that interview. Please try again.',
                );
                setBusy(false);
                setCancel(null);
                setReason('');
                if (ok) toast.success('Your interview was cancelled');
                await reload();
              }}
            >
              Cancel interview
            </Button>
          </>
        }
      >
        <Textarea
          label="Why are you cancelling? (optional)"
          maxLength={500}
          minRows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </Modal>
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
          {when(slot.startsAt).replace(/\s\S+$/, '')} – {timeOnly(slot.endsAt)}
        </Button>
      ))}
    </div>
  );
}

export function Thread({ application }: { application: PortalApplication }) {
  const { call, reload } = usePortal();
  const { typist, typing } = useThreadTyping(application.id);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
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
    let sent: FormData | { body: string } = { body: body.trim() };
    if (files.length) {
      // Files go with the message through the documents upload, as one message.
      const form = new FormData();
      form.append('kind', 'Other');
      form.append('body', body.trim());
      for (const file of files) form.append('file', file);
      sent = form;
    }
    const { ok } = await call(
      `/public/portal/applications/${application.id}/${files.length ? 'documents' : 'messages'}`,
      sent,
      'Your message was not sent. Please try again.',
    );
    setSending(false);
    if (!ok) return;
    setBody('');
    setFiles([]);
    toast.success('Message sent', 'The team will reply here and by email.');
    await reload();
  }

  return (
    <section className="flex flex-col gap-3" aria-label={`Messages about ${application.jobTitle}`}>
      {application.thread.length === 0 && (
        <p className="text-sm text-fg-subtle">
          No messages yet. Questions about this job? Write to the team below.
        </p>
      )}
      {threadItems(application).map((item) =>
        item.kind === 'email' ? (
          <EmailNote key={`e-${item.email.id}`} email={item.email} />
        ) : (
          <ChatBubble
            key={item.message.id}
            direction={item.message.fromCandidate ? 'out' : 'in'}
            time={`${item.message.fromCandidate ? 'You' : 'Hiring team'} · ${formatDateTime(item.message.createdAt)}${item.message.unread ? ' · new' : ''}`}
            files={
              item.message.files?.length
                ? item.message.files.map((file) => (
                    <FileCard
                      key={file.id}
                      name={file.fileName}
                      size={fileSize(file.length)}
                      href={documentHref(file.id)}
                    />
                  ))
                : undefined
            }
          >
            <MessageBody body={item.message.body} markdown={!item.message.fromCandidate} />
          </ChatBubble>
        ),
      )}
      {typist && (
        <p className="text-xs text-fg-subtle" aria-live="polite">
          {typist} is typing…
        </p>
      )}
      <form onSubmit={send} className="flex flex-col gap-2">
        <Textarea
          aria-label="Write a message to the hiring team"
          placeholder="Write a message…"
          minRows={2}
          maxLength={10000}
          value={body}
          onChange={(event) => {
            setBody(event.currentTarget.value);
            typing();
          }}
          onKeyDown={(event) => {
            // ⌘ or Ctrl + Enter sends, as in most chat apps.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
              event.currentTarget.form?.requestSubmit();
          }}
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((file, i) => (
              <FileCard
                key={`${file.name}-${i}`}
                name={file.name}
                size={fileSize(file.size)}
                onRemove={() => setFiles((all) => all.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {files.length < 10 && (
              <FileButton
                variant="quiet"
                size="sm"
                leftIcon={<Paperclip />}
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onFile={(file) => {
                  if (file.size > 10 * 1024 * 1024)
                    return toast.error('That file is too big', 'Choose a file under 10 MB.');
                  setFiles((all) => [...all, file]);
                }}
              >
                Attach a file
              </FileButton>
            )}
            <span className="text-xs text-fg-subtle tnum">
              {body.length > 9000 ? `${body.length.toLocaleString()} of 10,000` : ''}
            </span>
          </div>
          <Button type="submit" loading={sending} disabled={!body.trim() && files.length === 0}>
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
      'We could not withdraw your application. Please try again.',
    );
    if (ok) toast.success('Your application was withdrawn', 'We emailed you a confirmation.');
    setBusy(false);
    setOpen(false);
    setReason('');
    await reload();
  }

  return (
    <>
      <Button variant="danger-quiet" size="sm" onClick={() => setOpen(true)}>
        Withdraw application
      </Button>
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
            This ends your application for {application.jobTitle}. We cancel any interviews you have
            booked and let the team know. We also email you a confirmation. You can apply again
            later.
          </p>
          <Textarea
            label="Anything you want the team to know?"
            description="You can leave this empty."
            minRows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </div>
      </Modal>
    </>
  );
}

/** An email we sent, as a small note in the conversation. Opens to show the text when there is one. */
function EmailNote({ email }: { email: PortalEmail }) {
  const [open, setOpen] = useState(false);
  const label = `We emailed you: ${email.subject}`;
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      {email.body ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Mail className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-fg-subtle">· {formatDate(email.createdAt)}</span>
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      ) : (
        <p className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-fg-muted">
          <Mail className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-fg-subtle">· {formatDate(email.createdAt)}</span>
        </p>
      )}
      {open && email.body && (
        <RichText
          markdown={email.body}
          className="w-full rounded-lg border border-border-subtle p-3 text-sm text-fg-muted"
        />
      )}
    </div>
  );
}
