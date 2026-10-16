'use client';

import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, formatDateTime } from '@/lib/format';

type ThreadMessage = {
  id: string;
  fromCandidate: boolean;
  body: string;
  createdAt: string;
  unread: boolean;
};
type PortalApplication = {
  id: string;
  jobTitle: string;
  stage: string;
  status: string;
  appliedAt: string;
  canWithdraw: boolean;
  canReschedule: boolean;
  thread: ThreadMessage[];
  interviews: Array<{ id: string; title: string; startsAt: string; meetingLink?: string }>;
  proposedInterviews: Array<{ id: string; title: string; startsAt: string; endsAt: string }>;
  messages: Array<{ subject: string; body: string; createdAt: string }>;
};
type Portal = {
  candidate: { firstName: string; lastName: string };
  company?: string | null;
  applications: PortalApplication[];
};
type Slot = { startsAt: string; endsAt: string };
type Confirm =
  | { kind: 'withdraw'; application: PortalApplication }
  | { kind: 'cancel'; applicationId: string; interviewId: string; title: string };

const TOKEN_KEY = 'candidate-session';
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2');

// Plain words for the candidate, instead of the team's internal stage name.
function whatHappensNext(application: { status: string; stage: string }) {
  switch (application.status) {
    case 'Hired':
      return "You've been accepted";
    case 'Rejected':
      return 'This application is closed';
    case 'Withdrawn':
      return 'You withdrew this application';
  }
  const stage = application.stage.toLowerCase();
  if (stage === 'new' || stage.includes('review') || stage.includes('screen'))
    return "We're reviewing your application";
  if (stage.includes('interview') || stage.includes('booked')) return 'Interviews are in progress';
  if (stage.includes('offer') || stage.includes('decision')) return "We're finalising a decision";
  return `Current step: ${application.stage}`;
}
const when = (value: string) =>
  new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
const timeOnly = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
// Long date labels must wrap on a phone instead of being cut off.
const wrapLabel = { label: { whiteSpace: 'normal', textAlign: 'left' } } as const;

async function errorText(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (body?.message) return String(body.message);
    const first = body?.errors && (Object.values(body.errors)[0] as string[] | undefined)?.[0];
    if (first) return first;
  } catch {
    // no body
  }
  return fallback;
}

export default function CandidatePortalPage() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  useEffect(() => {
    fetch('/public/organization')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { name?: string } | null) => setCompany(data?.name ?? null))
      .catch(() => setCompany(null));
  }, []);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({});

  const signOut = useCallback((text: string) => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage unavailable
    }
    setPortal(null);
    setSent(false);
    setCode('');
    setMessage(text);
  }, []);

  const load = useCallback(async () => {
    const token = readToken();
    if (!token) {
      setLoaded(true);
      return;
    }
    try {
      const response = await fetch('/public/portal', { headers: { 'X-Candidate-Session': token } });
      if (response.ok) setPortal(await response.json());
      else if (response.status === 401)
        signOut('Your sign-in has expired. Enter your email to get a new code.');
      else setNotice('We could not refresh this page. Please try again in a moment.');
    } catch {
      setNotice('We could not reach the server. Check your connection and try again.');
    }
    setLoaded(true);
  }, [signOut]);

  useEffect(() => {
    load();
  }, [load]);

  // Every signed-in call goes through here so an expired session is handled in one place.
  async function call(
    path: string,
    body?: unknown,
    fallback = 'That did not work. Please try again.',
  ) {
    setNotice('');
    try {
      const response = await fetch(path, {
        method: path.endsWith('/availability') ? 'GET' : 'POST',
        headers: {
          'X-Candidate-Session': readToken(),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401) {
        signOut('Your sign-in has expired. Enter your email to get a new code.');
        return { ok: false as const, response };
      }
      if (!response.ok) setNotice(await errorText(response, fallback));
      return { ok: response.ok, response };
    } catch {
      setNotice('We could not reach the server. Check your connection and try again.');
      return { ok: false as const, response: null };
    }
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/public/portal/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(response.ok);
      setMessage(
        response.ok
          ? 'If that email is on file, a code is on its way. It can take a minute to arrive.'
          : 'We could not send a code right now. Please try again shortly.',
      );
    } catch {
      setMessage('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/public/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      if (!response.ok) {
        setMessage(
          'That code is invalid or expired. Check it and try again, or ask for a new one.',
        );
      } else {
        try {
          sessionStorage.setItem(TOKEN_KEY, (await response.json()).token);
        } catch {
          setMessage('Your browser is blocking storage, so we cannot keep you signed in.');
        }
        setMessage('');
        await load();
      }
    } catch {
      setMessage('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  async function loadAvailability(applicationId: string, interviewId: string) {
    const { ok, response } = await call(
      `/public/applications/${applicationId}/interviews/${interviewId}/availability`,
      undefined,
      'We could not load current availability.',
    );
    if (!ok || !response) return;
    const result = await response.json();
    const slots: Slot[] = result.slots ?? [];
    if (slots.length === 0)
      setNotice('There are no other times open right now. Message the team and they will help.');
    setAvailability((current) => ({ ...current, [interviewId]: slots }));
  }

  async function book(
    applicationId: string,
    interviewId: string,
    slot: Slot,
    verb: 'book' | 'reschedule',
  ) {
    const { ok } = await call(
      `/public/applications/${applicationId}/interviews/${interviewId}/${verb}`,
      slot,
      'That time is no longer available. Please pick another.',
    );
    if (!ok) return;
    setAvailability((current) => ({ ...current, [interviewId]: [] }));
    setNotice(verb === 'book' ? 'Your interview is booked.' : 'Your interview time was changed.');
    await load();
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    if (confirm.kind === 'cancel') {
      const { ok } = await call(
        `/public/applications/${confirm.applicationId}/interviews/${confirm.interviewId}/cancel`,
        undefined,
        'That interview could not be cancelled.',
      );
      if (ok) setNotice('Your interview was cancelled.');
    } else {
      const { ok } = await call(
        `/public/portal/applications/${confirm.application.id}/withdraw`,
        { reason: reason.trim() || null },
        'We could not withdraw your application.',
      );
      if (ok) setNotice('Your application was withdrawn. We have emailed you a confirmation.');
    }
    setBusy(false);
    setConfirm(null);
    setReason('');
    await load();
  }

  if (!portal)
    return (
      <Container size="xs" py="xl">
        <Stack>
          {company && (
            <Text size="sm" fw={600} c="dimmed">
              {company}
            </Text>
          )}
          <Title order={1}>Candidate portal</Title>
          {loaded && (
            <Text c="dimmed">
              See where your application stands, book interviews and message the hiring team. We
              will email you a code to sign in.
            </Text>
          )}
          {(message || notice) && (
            <Text role="status" size="sm">
              {message || notice}
            </Text>
          )}
          {!loaded ? (
            <Text c="dimmed">Loading…</Text>
          ) : !sent ? (
            <form onSubmit={requestCode}>
              <Stack>
                <TextInput
                  label="Email"
                  description="Use the email you applied with."
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Button type="submit" loading={busy}>
                  Email me a sign-in code
                </Button>
              </Stack>
            </form>
          ) : (
            <form onSubmit={verify}>
              <Stack>
                <TextInput
                  label="Sign-in code"
                  description={`Sent to ${email}.`}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
                <Button type="submit" loading={busy}>
                  Open portal
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => {
                    setSent(false);
                    setCode('');
                    setMessage('');
                  }}
                >
                  Use a different email
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Container>
    );

  return (
    <Container size="sm" py="xl" px="md">
      <Stack>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            {(portal.company ?? company) && (
              <Text size="sm" fw={600} c="dimmed">
                {portal.company ?? company}
              </Text>
            )}
            <Title order={1}>Hi, {portal.candidate.firstName}</Title>
          </div>
          <Button variant="subtle" size="compact-sm" onClick={() => signOut('You are signed out.')}>
            Sign out
          </Button>
        </Group>
        {notice && (
          <Paper withBorder p="sm" role="status">
            <Text size="sm">{notice}</Text>
          </Paper>
        )}
        {portal.applications.length === 0 && (
          <Text c="dimmed">
            You have no applications on file for this email yet. Once you apply, they show up here.
          </Text>
        )}
        {portal.applications.map((application) => (
          <Paper key={application.id} withBorder p="lg">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                <Title order={3}>{application.jobTitle}</Title>
                <Badge variant="default">{humanize(application.status)}</Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {whatHappensNext(application)} · Applied {formatDate(application.appliedAt)}
              </Text>

              {application.proposedInterviews.map((interview) => (
                <Stack key={interview.id} gap="xs">
                  <Text size="sm" fw={600}>
                    {interview.title}: pick a time
                  </Text>
                  <Button
                    variant="light"
                    fullWidth
                    styles={wrapLabel}
                    h="auto"
                    py={8}
                    onClick={() =>
                      book(
                        application.id,
                        interview.id,
                        { startsAt: interview.startsAt, endsAt: interview.endsAt },
                        'book',
                      )
                    }
                  >
                    Book {when(interview.startsAt)}
                  </Button>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => loadAvailability(application.id, interview.id)}
                  >
                    Find another time
                  </Button>
                  <Slots
                    slots={availability[interview.id]}
                    onPick={(slot) => book(application.id, interview.id, slot, 'book')}
                  />
                </Stack>
              ))}

              {application.interviews.map((interview) => (
                <Stack key={interview.id} gap="xs">
                  <Text size="sm">
                    <b>{interview.title}</b>: {when(interview.startsAt)}{' '}
                    {interview.meetingLink && (
                      <a href={interview.meetingLink} target="_blank" rel="noreferrer">
                        Join meeting
                      </a>
                    )}
                  </Text>
                  {application.canReschedule && (
                    <Group gap="xs">
                      <Button
                        variant="subtle"
                        size="compact-sm"
                        onClick={() => loadAvailability(application.id, interview.id)}
                      >
                        Change time
                      </Button>
                      <Button
                        variant="subtle"
                        color="red"
                        size="compact-sm"
                        onClick={() =>
                          setConfirm({
                            kind: 'cancel',
                            applicationId: application.id,
                            interviewId: interview.id,
                            title: interview.title,
                          })
                        }
                      >
                        Cancel interview
                      </Button>
                    </Group>
                  )}
                  <Slots
                    slots={availability[interview.id]}
                    onPick={(slot) => book(application.id, interview.id, slot, 'reschedule')}
                  />
                </Stack>
              ))}

              <Thread
                application={application}
                call={call}
                onChanged={load}
                setNotice={setNotice}
              />

              {application.messages.length > 0 && (
                <Stack gap="xs" mt="sm">
                  <Text fw={600}>Emails we sent you</Text>
                  {application.messages.map((item) => (
                    <Paper key={`${item.createdAt}-${item.subject}`} withBorder p="sm">
                      <Text fw={500}>{item.subject}</Text>
                      <Text size="xs" c="dimmed">
                        {formatDateTime(item.createdAt)}
                      </Text>
                      <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {item.body}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              )}

              {application.canWithdraw && (
                <Box mt="sm">
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    onClick={() => setConfirm({ kind: 'withdraw', application })}
                  >
                    Withdraw application
                  </Button>
                </Box>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'withdraw' ? 'Withdraw your application?' : 'Cancel this interview?'
        }
      >
        {confirm?.kind === 'withdraw' ? (
          <Stack>
            <Text size="sm">
              This ends your application for {confirm.application.jobTitle}. Any interviews you have
              booked are cancelled, the team is told, and we email you a confirmation. You can apply
              again in the future.
            </Text>
            <Textarea
              label="Anything you would like the team to know? (optional)"
              minRows={3}
              autosize
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirm(null)}>
                Keep my application
              </Button>
              <Button color="red" loading={busy} onClick={runConfirm}>
                Withdraw application
              </Button>
            </Group>
          </Stack>
        ) : (
          confirm && (
            <Stack>
              <Text size="sm">
                {confirm.title} will be cancelled and the team will be told. To pick a new time
                instead, choose Change time.
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setConfirm(null)}>
                  Keep interview
                </Button>
                <Button color="red" loading={busy} onClick={runConfirm}>
                  Cancel interview
                </Button>
              </Group>
            </Stack>
          )
        )}
      </Modal>
    </Container>
  );
}

function Slots({ slots, onPick }: { slots?: Slot[]; onPick: (slot: Slot) => void }) {
  if (!slots?.length) return null;
  return (
    <Stack gap={6}>
      {slots.map((slot) => (
        <Button
          key={slot.startsAt}
          variant="default"
          size="compact-md"
          fullWidth
          onClick={() => onPick(slot)}
        >
          {when(slot.startsAt)} – {timeOnly(slot.endsAt)}
        </Button>
      ))}
    </Stack>
  );
}

function Thread({
  application,
  call,
  onChanged,
  setNotice,
}: {
  application: PortalApplication;
  call: (path: string, body?: unknown, fallback?: string) => Promise<{ ok: boolean }>;
  onChanged: () => Promise<void>;
  setNotice: (text: string) => void;
}) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, application.id]);

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
    setNotice('Message sent. The team will reply here and by email.');
    await onChanged();
  }

  return (
    <Stack
      gap="xs"
      mt="sm"
      component="section"
      aria-label={`Messages about ${application.jobTitle}`}
    >
      <Group gap="xs">
        <Text fw={600}>Messages with the hiring team</Text>
        {unread > 0 && <Badge>{unread} new</Badge>}
      </Group>
      {application.thread.length === 0 && (
        <Text size="sm" c="dimmed">
          No messages yet. Questions about this role? Write to the team below.
        </Text>
      )}
      {application.thread.map((item) => (
        <Paper
          key={item.id}
          withBorder
          p="sm"
          ml={item.fromCandidate ? 'xl' : 0}
          mr={item.fromCandidate ? 0 : 'xl'}
          bg={item.fromCandidate ? 'var(--mantine-color-gray-0)' : undefined}
        >
          <Group justify="space-between" gap="xs">
            <Text size="xs" fw={600}>
              {item.fromCandidate ? 'You' : 'Hiring team'}
              {item.unread ? ' · new' : ''}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDateTime(item.createdAt)}
            </Text>
          </Group>
          <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
            {item.body}
          </Text>
        </Paper>
      ))}
      <form onSubmit={send}>
        <Stack gap="xs">
          <Textarea
            aria-label="Write a message to the hiring team"
            placeholder="Write a message…"
            minRows={2}
            autosize
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {body.length}/2000
            </Text>
            <Button type="submit" loading={sending} disabled={!body.trim()}>
              Send message
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
