'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Lightbulb, Mail, MessageSquare } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
} from '@/components/ui';
import { ConversationRow } from '@/components/messages/Chat';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { EmailsList, Interviews, Thread } from './ApplicationParts';
import { usePortalData } from './PortalShell';
import { isClosed, unreadCount } from './portal';

/** /candidate-portal/interviews: everything to book, then what's booked, across applications. */
export function PortalInterviews() {
  const portal = usePortalData();
  const withInterviews = portal.applications
    .filter((a) => a.proposedInterviews.length + a.interviews.length > 0)
    .sort((a, b) => b.proposedInterviews.length - a.proposedInterviews.length);
  const toBook = withInterviews.filter((a) => a.proposedInterviews.length > 0);
  const booked = withInterviews.filter((a) => a.proposedInterviews.length === 0);

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Pick times the team proposed, join booked interviews, or change a time."
      />
      {withInterviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No interviews yet"
            description="When the hiring team wants to meet you, they'll propose times and you'll pick one here."
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-6">
            {toBook.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                  Pick a time
                </h2>
                {toBook.map((a) => (
                  <Interviews
                    key={a.id}
                    application={a}
                    title={
                      <Link
                        href={`/candidate-portal/applications/${a.id}`}
                        className="hover:underline"
                      >
                        {a.jobTitle}
                      </Link>
                    }
                  />
                ))}
              </section>
            )}
            {booked.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                  Booked
                </h2>
                {booked.map((a) => (
                  <Interviews
                    key={a.id}
                    application={a}
                    title={
                      <Link
                        href={`/candidate-portal/applications/${a.id}`}
                        className="hover:underline"
                      >
                        {a.jobTitle}
                      </Link>
                    }
                  />
                ))}
              </section>
            )}
          </div>
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <Card>
              <CardHeader title="Tips for the day" />
              <CardBody>
                <ul className="space-y-3 text-sm text-fg-muted">
                  {[
                    'Join a few minutes early and check your camera and microphone.',
                    'Have a recent example of your work ready to talk through.',
                    'Prepare one or two questions about the team or the role.',
                    'Need a different time? Use Change time, or message the team.',
                  ].map((tip) => (
                    <li key={tip} className="flex gap-2">
                      <Lightbulb
                        className="mt-0.5 size-4 shrink-0 text-tone-amber-dot"
                        aria-hidden
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

/** /candidate-portal/messages: conversations (one per application) and copies of emails. */
export function PortalMessages() {
  const portal = usePortalData();
  const apps = [...portal.applications].sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  const [tab, setTab] = useState('conversations');
  const [selected, setSelected] = useState<string | null>(null);
  // Desktop opens the newest conversation; phones start on the list.
  useEffect(() => {
    if (selected === null && window.matchMedia('(min-width: 1024px)').matches)
      setSelected(apps[0]?.id ?? null);
  }, [apps, selected]);
  const current = apps.find((a) => a.id === selected);
  const emails = portal.applications.reduce((n, a) => n + a.messages.length, 0);
  const unread = portal.applications.reduce((n, a) => n + unreadCount(a), 0);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Talk to the hiring team and find every email we've sent you."
      />
      <Tabs
        aria-label="Messages"
        value={tab}
        onValueChange={setTab}
        className="mb-4"
        items={[
          { value: 'conversations', label: 'Conversations', count: unread || undefined },
          { value: 'emails', label: 'Emails', count: emails },
        ]}
      />
      {apps.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="Nothing here yet"
            description="Messages appear once you've applied for a role."
          />
        </Card>
      ) : tab === 'emails' ? (
        <Card>
          <CardBody className="space-y-6 pt-5">
            {emails === 0 ? (
              <EmptyState compact icon={Mail} title="No emails yet" />
            ) : (
              portal.applications
                .filter((a) => a.messages.length)
                .map((a) => (
                  <section key={a.id} className="space-y-2">
                    <h2 className="text-base font-semibold text-fg">{a.jobTitle}</h2>
                    <EmailsList application={a} />
                  </section>
                ))
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <ul
              aria-label="Conversations"
              className={cn('border-border-subtle lg:border-r', current && 'max-lg:hidden')}
            >
              {apps.map((a) => {
                const last = a.thread[a.thread.length - 1];
                return (
                  <li key={a.id}>
                    <ConversationRow
                      name={a.jobTitle}
                      subtitle={isClosed(a) ? 'Closed' : 'Hiring team'}
                      preview={
                        last
                          ? `${last.fromCandidate ? 'You: ' : ''}${last.body}`
                          : 'No messages yet'
                      }
                      time={last ? formatRelative(last.createdAt) : undefined}
                      unread={unreadCount(a) > 0}
                      selected={a.id === selected}
                      onClick={() => setSelected(a.id)}
                    />
                  </li>
                );
              })}
            </ul>
            <div className={cn('min-w-0 p-5', !current && 'max-lg:hidden')}>
              {current ? (
                <div className="space-y-3">
                  <Button
                    variant="quiet"
                    size="sm"
                    leftIcon={<ArrowLeft />}
                    className="lg:hidden"
                    onClick={() => setSelected(null)}
                  >
                    All conversations
                  </Button>
                  <Thread key={current.id} application={current} />
                </div>
              ) : (
                <EmptyState compact icon={MessageSquare} title="Choose a conversation" />
              )}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

const lastAt = (a: { thread: { createdAt: string }[]; lastActivityAt: string }) =>
  a.thread[a.thread.length - 1]?.createdAt ?? a.lastActivityAt;

const FAQ: [string, string][] = [
  [
    'How does the process work?',
    'Every application goes through the same steps: we receive it, the team reviews it, interviews follow if there is a match, and then a decision. The Overview of each application shows where it is right now.',
  ],
  [
    'How long does a review take?',
    'Usually a few days. You will hear from us either way, by email and here in the portal.',
  ],
  [
    'How do I pick or change an interview time?',
    'When the team proposes times, open Interviews and choose the one that suits you. If none work, use Find another time to see what else is open, or message the team. A booked interview can be moved with Change time.',
  ],
  [
    'Can I withdraw my application?',
    'Yes. Open the application and choose Withdraw application. Booked interviews are cancelled and the team is told. You can apply again later.',
  ],
  [
    'Who can see my messages?',
    'Only the hiring team for that role. Messages are part of your application record.',
  ],
  [
    'How do I sign in next time?',
    'Enter the email you applied with and we will send you a one-time code. Your session ends when you close the browser tab.',
  ],
];

/** /candidate-portal/help: how the process works and common questions. */
export function PortalHelp() {
  const portal = usePortalData();
  return (
    <>
      <PageHeader
        title="Help"
        description="How applications work and answers to common questions."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Accordion type="multiple" defaultValue={[FAQ[0][0]]}>
          {FAQ.map(([q, a]) => (
            <AccordionItem key={q} value={q} title={q}>
              {a}
            </AccordionItem>
          ))}
        </Accordion>
        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Your details" />
            <CardBody className="space-y-1 text-sm">
              <p className="text-base font-medium text-fg">
                {portal.candidate.firstName} {portal.candidate.lastName}
              </p>
              <p className="text-fg-muted">
                {portal.applications.length}{' '}
                {portal.applications.length === 1 ? 'application' : 'applications'}
                {portal.company ? ` with ${portal.company}` : ''}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Still stuck?" />
            <CardBody className="space-y-3 text-sm text-fg-muted">
              <p>Message the hiring team from any application. They reply here and by email.</p>
              <Button asChild variant="secondary" size="sm">
                <Link href="/candidate-portal/messages">Open messages</Link>
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
