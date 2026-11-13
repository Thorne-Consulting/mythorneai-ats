'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { MessageSquare, Paperclip, Send, Type } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { ChatBubble, DayDivider } from '@/components/messages/Chat';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Textarea,
  toast,
} from '@/components/ui';
import { useApplicationExtras } from './application-extras';
import { canManageRole, useInvalidateApplication } from './application-data';

const MAX = 2000;

function dayLabel(value: string) {
  const date = new Date(value);
  const label = date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return date.toDateString() === new Date().toDateString() ? `Today, ${label}` : label;
}

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Thread between the hiring team and the candidate. Separate from private review notes. */
export function ApplicationMessages({ id, canManage }: { id: string; canManage: boolean }) {
  const { query, messages } = useApplicationExtras(id);
  const invalidate = useInvalidateApplication(id);
  const [body, setBody] = useState('');
  const thread = useRef<HTMLDivElement>(null);
  const unread = messages.filter((item) => item.fromCandidate && !item.readAt).length;
  const application = query.data?.application;
  const firstName = application?.candidateName.split(' ')[0] ?? 'the candidate';

  const markRead = useMutation({
    mutationFn: () => api.post(`/api/applications/${id}/messages/read`),
    onSuccess: invalidate,
  });
  // Opening the page counts as reading the candidate's messages.
  useEffect(() => {
    if (canManage && unread > 0 && !markRead.isPending && !markRead.isSuccess) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, unread]);

  // Newest message at the bottom stays in view.
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: () => api.post(`/api/applications/${id}/messages`, { body }),
    onSuccess: () => {
      setBody('');
      invalidate();
      toast.success(
        'Message sent',
        'The candidate has been emailed and can reply from their portal.',
      );
    },
    onError: (error: Error) => toast.error('Could not send the message', error.message),
  });

  if (!canManage && messages.length === 0) return null;
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-3.5">
        {application && <Avatar name={application.candidateName} size="md" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-fg">
            {application
              ? `Messages with ${application.candidateName}`
              : 'Messages with the candidate'}
          </h2>
          {application && (
            <p className="truncate text-xs text-fg-subtle">{application.candidateEmail}</p>
          )}
        </div>
        {unread > 0 && (
          <Badge tone="blue" dot>
            {unread} new
          </Badge>
        )}
      </div>

      {messages.length === 0 ? (
        <EmptyState
          compact
          icon={MessageSquare}
          title="No messages yet"
          description="Write one below and the candidate gets it by email."
        />
      ) : (
        <div
          ref={thread}
          role="log"
          aria-label="Messages"
          tabIndex={0}
          className="max-h-[min(60vh,640px)] space-y-3 overflow-y-auto px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {messages.map((item, index) => {
            const day = dayLabel(item.createdAt);
            const newDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== day;
            const author = item.fromCandidate ? null : (item.authorEmail ?? 'Hiring team');
            return (
              <Fragment key={item.id}>
                {newDay && <DayDivider>{day}</DayDivider>}
                <ChatBubble
                  direction={item.fromCandidate ? 'in' : 'out'}
                  time={author ? `${timeOf(item.createdAt)} · ${author}` : timeOf(item.createdAt)}
                >
                  <span className="whitespace-pre-wrap break-words">{item.body}</span>
                </ChatBubble>
              </Fragment>
            );
          })}
        </div>
      )}

      {canManage && (
        <form
          className="space-y-2.5 border-t border-border-subtle px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          <p className="text-xs text-fg-muted">Reply via email</p>
          <Textarea
            aria-label="Message to the candidate"
            placeholder={`Write your message to ${firstName}…`}
            minRows={2}
            maxLength={MAX}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
          <div className="flex items-center gap-1">
            {/* ponytail: the API sends plain-text email only; these light up when it takes attachments. */}
            <IconButton
              type="button"
              variant="quiet"
              size="sm"
              label="Attach a file (not available yet)"
              disabled
            >
              <Paperclip />
            </IconButton>
            <IconButton
              type="button"
              variant="quiet"
              size="sm"
              label="Formatting (not available yet)"
              disabled
            >
              <Type />
            </IconButton>
            <span className="ml-2 text-xs text-fg-subtle tnum">
              {body.length}/{MAX}
            </span>
            <Button
              type="submit"
              className="ml-auto"
              leftIcon={<Send />}
              loading={send.isPending}
              disabled={!body.trim()}
            >
              Send message
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function ApplicationMessagesTab({ id }: { id: string }) {
  const user = useCurrentUser();
  return <ApplicationMessages id={id} canManage={canManageRole(user.role)} />;
}
