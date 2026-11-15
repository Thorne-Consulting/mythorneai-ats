'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarPlus,
  CalendarX2,
  Clock,
  Download,
  ExternalLink,
  MapPin,
  Users,
  Video,
} from 'lucide-react';
import { Alert, Button, Card, CardBody, Modal, SkeletonRows, Textarea } from '@/components/ui';
import { SlotPicker } from '@/components/scheduling/SlotPicker';
import {
  calendarLinks,
  dayLabel,
  dayKey,
  timeLabel,
  zoneLongName,
  type Slot,
} from '@/components/scheduling/time';
import { safeWebUrl } from '@/lib/safe-url';

type Booking = {
  startsAt: string;
  endsAt: string;
  status: string;
  meetingLink?: string | null;
  where?: string | null;
  calendarFile: string;
  canChange: boolean;
  changeBlockedReason?: string | null;
};

type LinkPage = {
  company?: string | null;
  jobTitle: string;
  title: string;
  durationMinutes: number;
  meetingType?: string | null;
  location?: string | null;
  interviewers: string[];
  candidateFirstName: string;
  candidateTimeZone?: string | null;
  status: 'Open' | 'Booked' | 'Cancelled' | 'Expired';
  expiresAt: string;
  offered: boolean;
  message?: string | null;
  booking?: Booking | null;
};

const FORMATS: Record<string, string> = {
  GoogleMeet: 'Google Meet video call',
  Teams: 'Microsoft Teams video call',
  Link: 'Video call',
  Phone: 'Phone call',
  InPerson: 'In person',
};

async function send<T>(
  path: string,
  body?: unknown,
): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (response.ok) return { data: json as T, status: response.status };
    return {
      status: response.status,
      error:
        json?.message ??
        (response.status === 429
          ? 'Too many tries in a short time. Wait a minute, then try again.'
          : 'That did not work. Please try again.'),
    };
  } catch {
    return {
      status: 0,
      error: 'We could not reach the server. Check your connection and try again.',
    };
  }
}

/** The no-sign-in page a candidate books, moves or cancels an interview from. */
export function BookingPage({ token }: { token: string }) {
  const base = `/public/scheduling/${encodeURIComponent(token)}`;
  const [page, setPage] = useState<LinkPage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [changing, setChanging] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    send<LinkPage>(base).then(({ data, error }) => {
      if (data) {
        setPage(data);
        setZone(
          Intl.DateTimeFormat().resolvedOptions().timeZone || data.candidateTimeZone || 'UTC',
        );
      } else setFailure(error ?? 'We could not open this link.');
    });
  }, [base]);

  const picking = page?.status === 'Open' || changing;
  const loadSlots = useCallback(() => {
    setSlots(null);
    send<{ slots: Slot[] }>(`${base}/slots`).then(({ data, error }) => {
      if (data) setSlots(data.slots);
      else {
        setSlots([]);
        setError(error ?? null);
      }
    });
  }, [base]);
  useEffect(() => {
    if (picking) loadSlots();
  }, [picking, loadSlots]);

  const book = async () => {
    if (!chosen || !zone) return;
    setBusy(true);
    setError(null);
    const { data, error } = await send<LinkPage>(`${base}/book`, {
      startsAt: chosen.startsAt,
      timeZone: zone,
      note: note.trim() || null,
    });
    setBusy(false);
    if (data) {
      setPage(data);
      setChanging(false);
      setChosen(null);
    } else {
      setError(error ?? null);
      setChosen(null);
      loadSlots();
    }
  };

  const cancel = async () => {
    setBusy(true);
    const { data, error } = await send<LinkPage>(`${base}/cancel`, {
      reason: reason.trim() || null,
    });
    setBusy(false);
    setCancelOpen(false);
    if (data) setPage(data);
    else setError(error ?? null);
  };

  if (failure)
    return (
      <Shell>
        <Card>
          <CardBody className="space-y-2 py-8 text-center">
            <CalendarX2 className="mx-auto size-8 text-fg-subtle" aria-hidden />
            <h1 className="text-xl font-semibold text-fg">This link does not work</h1>
            <p className="text-base text-fg-muted">{failure}</p>
          </CardBody>
        </Card>
      </Shell>
    );
  if (!page || !zone)
    return (
      <Shell>
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      </Shell>
    );

  const booking = page.booking;
  const format = page.meetingType ? FORMATS[page.meetingType] : null;
  const range = (slot: Slot) =>
    `${dayLabel(dayKey(slot.startsAt, zone))}, ${timeLabel(slot.startsAt, zone)} – ${timeLabel(slot.endsAt, zone)}`;

  return (
    <Shell>
      <Card>
        <CardBody className="space-y-5 py-6">
          <header className="space-y-3">
            <p className="text-sm text-fg-muted">
              {page.company ? `${page.company} · ` : ''}
              {page.jobTitle}
            </p>
            <h1 className="text-2xl font-bold text-fg">
              {page.status === 'Booked' && !changing
                ? `You're booked, ${page.candidateFirstName}`
                : page.status === 'Open' || changing
                  ? `Choose a time for your ${page.title.toLowerCase().endsWith('interview') ? page.title : `${page.title} interview`}`
                  : page.title}
            </h1>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg-muted">
              <li className="inline-flex items-center gap-1.5">
                <Clock className="size-4 text-fg-subtle" aria-hidden />
                {page.durationMinutes} minutes
              </li>
              {format && (
                <li className="inline-flex items-center gap-1.5">
                  {page.meetingType === 'InPerson' ? (
                    <MapPin className="size-4 text-fg-subtle" aria-hidden />
                  ) : (
                    <Video className="size-4 text-fg-subtle" aria-hidden />
                  )}
                  {format}
                  {page.location ? `, ${page.location}` : ''}
                </li>
              )}
              <li className="inline-flex items-center gap-1.5">
                <Users className="size-4 text-fg-subtle" aria-hidden />
                With {page.interviewers.join(', ')}
              </li>
            </ul>
            {page.message && page.status === 'Open' && (
              <p className="rounded-lg bg-muted p-3 text-base whitespace-pre-wrap text-fg">
                {page.message}
              </p>
            )}
          </header>

          {error && (
            <Alert tone="danger" title="That did not work" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          {page.status === 'Expired' && (
            <Alert tone="warning" title="This link has expired">
              Message the hiring team and they will send you a new one.
            </Alert>
          )}
          {page.status === 'Cancelled' && (
            <Alert tone="neutral" icon={CalendarX2} title="This interview is cancelled">
              {booking
                ? `It was set for ${range(booking)}. The hiring team will be in touch about next steps.`
                : 'The hiring team will be in touch about next steps.'}
            </Alert>
          )}

          {picking && !chosen && (
            <SlotPicker
              slots={slots ?? []}
              loading={slots === null}
              timeZone={zone}
              onTimeZoneChange={setZone}
              value={null}
              onChange={setChosen}
            />
          )}

          {picking && chosen && (
            <section className="space-y-4" aria-label="Confirm your time">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-fg-subtle">You picked</p>
                <p className="mt-1 text-lg font-semibold text-fg">{range(chosen)}</p>
                <p className="text-sm text-fg-muted">
                  {zoneLongName(zone, new Date(chosen.startsAt))}
                </p>
              </div>
              {!changing && (
                <Textarea
                  label="Anything the team should know? (optional)"
                  maxLength={1000}
                  minRows={2}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} onClick={book}>
                  {changing ? 'Move to this time' : 'Book this time'}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setChosen(null)}>
                  Pick another time
                </Button>
                {changing && (
                  <Button
                    variant="quiet"
                    disabled={busy}
                    onClick={() => {
                      setChanging(false);
                      setChosen(null);
                    }}
                  >
                    Keep my current time
                  </Button>
                )}
              </div>
            </section>
          )}

          {page.status === 'Booked' && booking && !changing && (
            <Confirmation
              page={page}
              booking={booking}
              zone={zone}
              range={range(booking)}
              onChange={() => setChanging(true)}
              onCancel={() => setCancelOpen(true)}
            />
          )}
        </CardBody>
      </Card>

      <Modal
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        dismissable={!busy}
        title="Cancel your interview?"
        description="The team is told right away. If you want another time instead, choose Change time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep my interview
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
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
    </Shell>
  );
}

function Confirmation({
  page,
  booking,
  zone,
  range,
  onChange,
  onCancel,
}: {
  page: LinkPage;
  booking: Booking;
  zone: string;
  range: string;
  onChange: () => void;
  onCancel: () => void;
}) {
  const join = safeWebUrl(booking.meetingLink);
  const links = calendarLinks({
    title: `${page.title} interview${page.company ? ` with ${page.company}` : ''}`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    details: [`Your ${page.title} interview for ${page.jobTitle}.`, booking.where]
      .filter(Boolean)
      .join('\n'),
    location: booking.meetingLink ?? page.location,
  });
  return (
    <section className="space-y-5" aria-label="Your booking">
      <div className="flex items-start gap-3 rounded-lg bg-tone-green-bg p-4">
        <CalendarCheck className="mt-0.5 size-5 shrink-0 text-tone-green-fg" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-fg">{range}</p>
          <p className="text-sm text-fg-muted">{zoneLongName(zone, new Date(booking.startsAt))}</p>
          {booking.where && <p className="mt-1 text-base text-fg">{booking.where}</p>}
          <p className="mt-1 text-sm text-fg-muted">We also sent this to you by email.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {join && (
          <Button asChild>
            <a href={join} target="_blank" rel="noreferrer">
              Join the call
              <ExternalLink />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
        <Button asChild variant="secondary" leftIcon={<CalendarPlus />}>
          <a href={links.google} target="_blank" rel="noreferrer">
            Add to Google Calendar
          </a>
        </Button>
        <Button asChild variant="secondary" leftIcon={<CalendarPlus />}>
          <a href={links.outlook} target="_blank" rel="noreferrer">
            Add to Outlook
          </a>
        </Button>
        <Button asChild variant="secondary" leftIcon={<Download />}>
          <a href={booking.calendarFile} download="interview.ics">
            Apple Calendar or other (.ics)
          </a>
        </Button>
      </div>
      <div className="border-t border-border-subtle pt-4">
        {booking.canChange ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-fg-muted">Need a different time?</p>
            <Button variant="soft" onClick={onChange}>
              Change time
            </Button>
            <Button variant="danger-quiet" onClick={onCancel}>
              Cancel interview
            </Button>
          </div>
        ) : (
          booking.changeBlockedReason && (
            <p className="text-sm text-fg-muted">{booking.changeBlockedReason}</p>
          )
        )}
      </div>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>;
}
