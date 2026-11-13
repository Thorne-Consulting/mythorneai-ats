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
  IconButton,
  PageHeader,
  Tabs,
} from '@/components/ui';
import { ConversationRow } from '@/components/messages/Chat';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { EmailsList, Interviews, Thread } from './ApplicationParts';
import { usePortalData } from './PortalShell';
import { isClosed, unreadCount } from './portal';

/** /candidate-portal/interviews: every application with interviews, ones needing a time first. */
export function PortalInterviews() {
  const portal = usePortalData();
  const withInterviews = portal.applications
    .filter((a) => a.proposedInterviews.length + a.interviews.length > 0)
    .sort((a, b) => b.proposedInterviews.length - a.proposedInterviews.length);

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Pick a time the team suggested, join a booked interview, or change a time."
      />
      {withInterviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No interviews yet"
            description="When the hiring team wants to meet you, they will suggest times. You can pick one here."
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-5">
            {withInterviews.map((a) => (
              <Interviews
                key={a.id}
                application={a}
                title={
                  <Link href={`/candidate-portal/applications/${a.id}`} className="hover:underline">
                    {a.jobTitle}
                  </Link>
                }
              />
            ))}
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
        description="Write to the hiring team, and read copies of the emails we sent you."
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
            title="No messages yet"
            description="Once you apply for a job, you can message the hiring team here."
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
                  <div className="flex items-center gap-2 lg:hidden">
                    <IconButton
                      label="All conversations"
                      variant="quiet"
                      onClick={() => setSelected(null)}
                    >
                      <ArrowLeft />
                    </IconButton>
                    <h2 className="truncate text-lg font-semibold text-fg">{current.jobTitle}</h2>
                  </div>
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
    'Every application goes through the same steps. We receive it and the team reviews it. If it is a good fit, interviews follow. Then the team makes a decision. Open an application to see where it is now.',
  ],
  [
    'How long does a review take?',
    'Usually a few days. You will hear from us either way, by email and here in the portal.',
  ],
  [
    'How do I pick or change an interview time?',
    'When the team suggests times, open Interviews and pick the one that works for you. If none work, choose Find another time, or message the team. To move a booked interview, choose Change time.',
  ],
  [
    'Can I withdraw my application?',
    'Yes. Open the application and choose Withdraw application. We cancel any interviews you booked and tell the team. You can apply again later.',
  ],
  [
    'Who can see my messages?',
    'Only the hiring team for that job. Your messages are saved with your application.',
  ],
  [
    'How do I sign in next time?',
    'Enter the email you applied with, and we will email you a code. Closing the browser tab signs you out.',
  ],
];

/** /candidate-portal/help: how the process works and common questions. */
export function PortalHelp() {
  return (
    <>
      <PageHeader title="Help" />
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
