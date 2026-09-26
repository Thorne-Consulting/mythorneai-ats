'use client';

import { Button, Container, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';

type Portal = {
  candidate: { firstName: string; lastName: string };
  applications: Array<{
    id: string;
    jobTitle: string;
    stage: string;
    status: string;
    appliedAt: string;
    interviews: Array<{ id: string; title: string; startsAt: string; meetingLink?: string }>;
    proposedInterviews: Array<{ id: string; title: string; startsAt: string; endsAt: string }>;
    messages: Array<{ subject: string; body: string; createdAt: string }>;
  }>;
};

export default function CandidatePortalPage() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState<
    Record<string, { startsAt: string; endsAt: string }[]>
  >({});
  async function load() {
    const token = sessionStorage.getItem('candidate-session');
    if (!token) return;
    const response = await fetch('/public/portal', { headers: { 'X-Candidate-Session': token } });
    if (response.ok) setPortal(await response.json());
  }
  useEffect(() => {
    load();
  }, []);
  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/public/portal/access-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(response.ok);
    setMessage('If that email is on file, a code is on its way.');
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/public/portal/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!response.ok) {
      setMessage('That code is invalid or expired.');
      return;
    }
    sessionStorage.setItem('candidate-session', (await response.json()).token);
    load();
  }
  async function loadAvailability(applicationId: string, interviewId: string) {
    const response = await fetch(
      `/public/applications/${applicationId}/interviews/${interviewId}/availability`,
      { headers: { 'X-Candidate-Session': sessionStorage.getItem('candidate-session') ?? '' } },
    );
    if (!response.ok) {
      setMessage('We could not load current availability.');
      return;
    }
    const result = await response.json();
    setAvailability((current) => ({ ...current, [interviewId]: result.slots ?? [] }));
  }
  async function book(
    applicationId: string,
    interviewId: string,
    startsAt?: string,
    endsAt?: string,
  ) {
    const response = await fetch(
      `/public/applications/${applicationId}/interviews/${interviewId}/book`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Candidate-Session': sessionStorage.getItem('candidate-session') ?? '',
        },
        body: JSON.stringify({ startsAt, endsAt }),
      },
    );
    if (response.ok) load();
    else setMessage('That time is no longer available.');
  }
  async function cancel(applicationId: string, interviewId: string) {
    if (!window.confirm('Cancel this interview?')) return;
    const response = await fetch(
      `/public/applications/${applicationId}/interviews/${interviewId}/cancel`,
      {
        method: 'POST',
        headers: { 'X-Candidate-Session': sessionStorage.getItem('candidate-session') ?? '' },
      },
    );
    if (response.ok) load();
    else setMessage('That interview could not be cancelled.');
  }
  if (!portal)
    return (
      <Container size="sm" py="xl">
        <Stack>
          <Title order={1}>Candidate portal</Title>
          <Text>{message}</Text>
          {!sent ? (
            <form onSubmit={requestCode}>
              <Stack>
                <TextInput
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <Button type="submit">Email me a sign-in code</Button>
              </Stack>
            </form>
          ) : (
            <form onSubmit={verify}>
              <Stack>
                <TextInput
                  label="Sign-in code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
                <Button type="submit">Open portal</Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Container>
    );
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>Hi, {portal.candidate.firstName}</Title>
        {portal.applications.map((application) => (
          <Paper key={application.id} withBorder p="lg">
            <Stack gap="xs">
              <Title order={3}>{application.jobTitle}</Title>
              <Text>
                {application.stage} · {application.status}
              </Text>
              {application.proposedInterviews.map((interview) => (
                <Stack key={interview.id} gap="xs">
                  <Button
                    variant="light"
                    onClick={() =>
                      book(application.id, interview.id, interview.startsAt, interview.endsAt)
                    }
                  >
                    Book {interview.title} · {new Date(interview.startsAt).toLocaleString()}
                  </Button>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => loadAvailability(application.id, interview.id)}
                  >
                    Find another time
                  </Button>
                  {(availability[interview.id] ?? []).map((slot) => (
                    <Button
                      key={slot.startsAt}
                      variant="default"
                      size="compact-sm"
                      onClick={() => book(application.id, interview.id, slot.startsAt, slot.endsAt)}
                    >
                      {new Date(slot.startsAt).toLocaleString()} –{' '}
                      {new Date(slot.endsAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Button>
                  ))}
                </Stack>
              ))}
              {application.interviews.map((interview) => (
                <Stack key={interview.id} gap="xs">
                  <Text>
                    {interview.title}: {new Date(interview.startsAt).toLocaleString()}{' '}
                    {interview.meetingLink && <a href={interview.meetingLink}>Join meeting</a>}
                  </Text>
                  <Button
                    variant="subtle"
                    color="red"
                    size="compact-sm"
                    onClick={() => cancel(application.id, interview.id)}
                  >
                    Cancel interview
                  </Button>
                </Stack>
              ))}
              {application.messages.length > 0 && (
                <Stack gap="xs" mt="sm">
                  <Text fw={600}>Messages</Text>
                  {application.messages.map((item) => (
                    <Paper key={`${item.createdAt}-${item.subject}`} withBorder p="sm">
                      <Text fw={500}>{item.subject}</Text>
                      <Text size="xs" c="dimmed">
                        {new Date(item.createdAt).toLocaleString()}
                      </Text>
                      <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {item.body}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}
