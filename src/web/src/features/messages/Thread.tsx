'use client';

import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  CircleCheck,
  Clock,
  ExternalLink,
  Inbox,
  MailOpen,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Star,
  UserRound,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { ChatBubble, DayDivider, FileCard, MessageBody } from '@/components/messages/Chat';
import {
  Alert,
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Modal,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { Composer, type ComposerHandle } from './Composer';
import {
  formatSize,
  threadMessages,
  timePresets,
  unsendMessage,
  useAssignees,
  useRefreshThreads,
  useThread,
  useThreadActions,
  whenText,
  type ThreadInfo,
  type ThreadMessage,
} from './inbox-data';
import { useTyping } from './live';

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const label = date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  });
  if (date.toDateString() === today.toDateString()) return `Today, ${label}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${label}`;
  return label;
}

export type ThreadHandle = ComposerHandle;

/**
 * One candidate conversation, the same in the inbox and on the application's Messages tab:
 * messages with delivery status, files and typing, then the composer.
 */
export const Thread = forwardRef<
  ThreadHandle,
  {
    applicationId: string;
    /** The inbox shows a header with the person and thread actions; the application tab does not. */
    header?: boolean;
    onBack?: () => void;
    railOpen?: boolean;
    onToggleRail?: () => void;
    /** Called after Done or Mark as unread, so the inbox can move on. */
    onLeave?: () => void;
  }
>(function Thread({ applicationId, header = true, onBack, railOpen, onToggleRail, onLeave }, ref) {
  const query = useThread(applicationId);
  const info = query.data?.pages[0]?.thread;
  const messages = threadMessages(query.data);
  const { markRead } = useThreadActions(applicationId);
  const { typist, typing } = useTyping(applicationId);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  useImperativeHandle(ref, () => ({
    focus: () => composer.current?.focus(),
    addFiles: (files) => composer.current?.addFiles(files),
    restore: (body, files) => composer.current?.restore(body, files),
  }));

  // Opening the thread reads it (for me) and tells the candidate it was seen.
  const unread = info?.unread;
  useEffect(() => {
    if (unread && !markRead.isPending) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, applicationId]);

  // Stay pinned to the newest message unless the reader scrolled up; keep place when loading older.
  const older = useRef<{ height: number; top: number } | null>(null);
  const lastId = messages.at(-1)?.id;
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (older.current) {
      el.scrollTop = el.scrollHeight - older.current.height + older.current.top;
      older.current = null;
    } else if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [lastId, messages.length, typist]);
  useEffect(() => {
    pinned.current = true;
  }, [applicationId]);

  if (query.isError)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load this conversation"
        description="It may have moved, or you may no longer have access to it."
        action={
          <Button variant="secondary" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    );

  return (
    <section
      aria-label={info ? `Conversation with ${info.candidateName}` : 'Conversation'}
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!info || info.blockedReason || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!dragging) return;
        event.preventDefault();
        setDragging(false);
        composer.current?.addFiles([...event.dataTransfer.files]);
      }}
    >
      {header && (
        <ThreadHeader
          info={info}
          onBack={onBack}
          railOpen={railOpen}
          onToggleRail={onToggleRail}
          onLeave={onLeave}
        />
      )}

      <div
        ref={scroller}
        role="log"
        aria-label="Messages"
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset sm:px-5"
      >
        {!query.data ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            {query.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="quiet"
                  size="xs"
                  loading={query.isFetchingNextPage}
                  onClick={() => {
                    const el = scroller.current;
                    if (el) older.current = { height: el.scrollHeight, top: el.scrollTop };
                    query.fetchNextPage();
                  }}
                >
                  Show earlier messages
                </Button>
              </div>
            )}
            {messages.length === 0 ? (
              <EmptyState
                compact
                icon={MessageSquare}
                title="No messages yet"
                description={
                  info?.blockedReason ? undefined : `Write to ${info?.candidateFirstName} below.`
                }
              />
            ) : (
              messages.map((message, index) => {
                const day = dayLabel(message.createdAt);
                const newDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== day;
                return (
                  <Fragment key={message.id}>
                    {newDay && <DayDivider>{day}</DayDivider>}
                    <MessageBubble
                      message={message}
                      onEdit={(body, files) => composer.current?.restore(body, files)}
                    />
                  </Fragment>
                );
              })
            )}
            {typist && (
              <p className="flex items-center gap-1.5 text-xs text-fg-subtle" aria-live="polite">
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-pulse rounded-full bg-fg-subtle"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
                {typist} is typing…
              </p>
            )}
          </>
        )}
      </div>

      {info &&
        (info.blockedReason ? (
          <div className="border-t border-border-subtle p-3 sm:p-4">
            <Alert tone="warning">{info.blockedReason}</Alert>
          </div>
        ) : (
          <>
            {info.emailBounced && (
              <p className="flex items-center gap-1.5 border-t border-border-subtle bg-tone-amber-bg px-4 py-2 text-xs text-tone-amber-fg">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                Emails to {info.candidateEmail} bounce. {info.candidateFirstName} still sees
                messages in their candidate portal.
              </p>
            )}
            <Composer
              key={applicationId}
              ref={composer}
              applicationId={applicationId}
              firstName={info.candidateFirstName}
              replyByEmail={info.replyByEmail}
              onTyping={typing}
            />
          </>
        ))}

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-accent/90 text-base font-medium text-accent-foreground">
          Drop files to attach them
        </div>
      )}
    </section>
  );
});

function ThreadHeader({
  info,
  onBack,
  railOpen,
  onToggleRail,
  onLeave,
}: {
  info?: ThreadInfo;
  onBack?: () => void;
  railOpen?: boolean;
  onToggleRail?: () => void;
  onLeave?: () => void;
}) {
  const { patch } = useThreadActions(info?.applicationId ?? '');
  const router = useRouter();
  const markDone = () => {
    if (!info) return;
    patch.mutate(
      { done: !info.done },
      {
        onSuccess: () =>
          !info.done &&
          toast.success('Marked done', undefined, {
            action: { label: 'Undo', onClick: () => patch.mutate({ done: false }) },
          }),
      },
    );
    if (!info.done) onLeave?.();
  };
  return (
    <header className="flex min-h-[61px] items-center gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
      {onBack && (
        <IconButton label="Back to conversations" variant="quiet" size="sm" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
      )}
      {info ? (
        <>
          <Avatar name={info.candidateName} size="md" className="max-sm:hidden" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-fg">{info.candidateName}</h2>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
              <Link
                href={`/applications/${info.applicationId}`}
                className="truncate text-accent-foreground hover:underline"
              >
                {info.jobTitle}
              </Link>
              {info.snoozedUntil && new Date(info.snoozedUntil) > new Date() && (
                <span className="inline-flex shrink-0 items-center gap-1 text-fg-subtle">
                  <AlarmClock className="size-3.5" aria-hidden />
                  Back {whenText(info.snoozedUntil)}
                </span>
              )}
            </p>
          </div>
          <AssigneeMenu info={info} />
          <SnoozeMenu info={info} onSnoozed={onLeave} />
          <IconButton
            label={info.starred ? 'Remove star (s)' : 'Star (s)'}
            variant="quiet"
            size="sm"
            aria-pressed={info.starred}
            onClick={() => patch.mutate({ starred: !info.starred })}
            className="max-sm:hidden"
          >
            <Star className={cn(info.starred && 'fill-current text-tone-amber-dot')} />
          </IconButton>
          <IconButton
            label={info.done ? 'Move to inbox (e)' : 'Mark done (e)'}
            variant="quiet"
            size="sm"
            onClick={markDone}
          >
            {info.done ? <Inbox /> : <CircleCheck />}
          </IconButton>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="More actions" variant="quiet" size="sm">
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                icon={<Star />}
                shortcut="s"
                className="sm:hidden"
                onSelect={() => patch.mutate({ starred: !info.starred })}
              >
                {info.starred ? 'Remove star' : 'Star'}
              </MenuItem>
              <MenuItem
                icon={<MailOpen />}
                shortcut="u"
                onSelect={() => {
                  patch.mutate({ unread: true });
                  onLeave?.();
                }}
              >
                Mark as unread
              </MenuItem>
              <MenuItem
                icon={<ExternalLink />}
                onSelect={() => router.push(`/applications/${info.applicationId}`)}
              >
                Open application
              </MenuItem>
            </MenuContent>
          </Menu>
          {onToggleRail && (
            <IconButton
              label={railOpen ? 'Hide details' : 'Show details'}
              variant="quiet"
              size="sm"
              aria-pressed={railOpen}
              onClick={onToggleRail}
            >
              <PanelRight />
            </IconButton>
          )}
        </>
      ) : (
        <div className="h-9 flex-1" />
      )}
    </header>
  );
}

/** Who owns the conversation: their initials, or a person icon when nobody does. Press a to open. */
export function AssigneeMenu({ info }: { info: ThreadInfo }) {
  const me = useCurrentUser().email;
  const { patch } = useThreadActions(info.applicationId);
  const [open, setOpen] = useState(false);
  const people = useAssignees(info.applicationId, open);
  const assign = (email: string, name?: string) =>
    patch.mutate(
      { assignee: email },
      {
        onSuccess: () =>
          toast.success(
            email
              ? email === me
                ? 'Assigned to you'
                : `Assigned to ${name ?? email}`
              : 'Unassigned',
          ),
      },
    );
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <button
          type="button"
          id={`assign-${info.applicationId}`}
          aria-label={
            info.assigneeEmail
              ? `Assigned to ${info.assigneeName ?? info.assigneeEmail}. Change (a)`
              : 'Assign (a)'
          }
          title={
            info.assigneeEmail ? `Assigned to ${info.assigneeName ?? info.assigneeEmail}` : 'Assign'
          }
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {info.assigneeEmail ? (
            <Avatar name={info.assigneeName ?? info.assigneeEmail} size="xs" />
          ) : (
            <UserRound className="size-[18px]" />
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        <MenuLabel>Assign to</MenuLabel>
        {info.assigneeEmail !== me && <MenuItem onSelect={() => assign(me)}>Me</MenuItem>}
        {(people.data ?? [])
          .filter((p) => p.email !== me)
          .map((person) => (
            <MenuItem
              key={person.email}
              onSelect={() => assign(person.email, person.name)}
              className={
                person.email === info.assigneeEmail ? 'bg-accent text-accent-foreground' : undefined
              }
            >
              {person.name}
            </MenuItem>
          ))}
        {!people.data && <p className="px-3 py-2 text-xs text-fg-subtle">Loading people…</p>}
        {info.assigneeEmail && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => assign('')}>Unassign</MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/** Snooze until later today, tomorrow, Monday or a chosen time. It returns to the inbox then. */
export function SnoozeMenu({ info, onSnoozed }: { info: ThreadInfo; onSnoozed?: () => void }) {
  const { patch } = useThreadActions(info.applicationId);
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState('');
  const snoozed = !!info.snoozedUntil && new Date(info.snoozedUntil) > new Date();
  const local = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const snooze = (at: Date) => {
    patch.mutate(
      { snoozeUntil: at.toISOString() },
      {
        onSuccess: () =>
          toast.success(`Snoozed until ${whenText(at)}`, 'It comes back to the inbox then.', {
            action: { label: 'Undo', onClick: () => patch.mutate({ unsnooze: true }) },
          }),
      },
    );
    onSnoozed?.();
  };
  const chosen = value ? new Date(value) : null;
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            id={`snooze-${info.applicationId}`}
            label={snoozed ? `Snoozed until ${whenText(info.snoozedUntil!)} (h)` : 'Snooze (h)'}
            variant="quiet"
            size="sm"
            aria-pressed={snoozed}
          >
            <AlarmClock className={cn(snoozed && 'text-accent-foreground')} />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuLabel>Snooze until</MenuLabel>
          {timePresets().map((preset) => (
            <MenuItem key={preset.label} onSelect={() => snooze(preset.at)}>
              <span className="flex w-full justify-between gap-3">
                {preset.label}
                <span className="text-fg-subtle">{whenText(preset.at).split(', ').pop()}</span>
              </span>
            </MenuItem>
          ))}
          <MenuItem
            onSelect={() => {
              setValue(local(new Date(Date.now() + 24 * 3_600_000)));
              setCustom(true);
            }}
          >
            Pick a date and time…
          </MenuItem>
          {snoozed && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => patch.mutate({ unsnooze: true })}>
                Back to the inbox now
              </MenuItem>
            </>
          )}
          <p className="px-3 pt-1 pb-2 text-2xs text-fg-subtle">
            A reply from the candidate brings it back early.
          </p>
        </MenuContent>
      </Menu>
      <Modal
        opened={custom}
        onClose={() => setCustom(false)}
        title="Snooze until"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustom(false)}>
              Cancel
            </Button>
            <Button
              disabled={!chosen || chosen <= new Date()}
              onClick={() => {
                setCustom(false);
                snooze(chosen!);
              }}
            >
              Snooze
            </Button>
          </>
        }
      >
        <Input
          type="datetime-local"
          label="Bring it back on"
          min={local(new Date())}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </Modal>
    </>
  );
}

function MessageBubble({
  message,
  onEdit,
}: {
  message: ThreadMessage;
  onEdit: (body: string, files: ThreadMessage['attachments']) => void;
}) {
  const [full, setFull] = useState(false);
  const refresh = useRefreshThreads();
  const out = !message.fromCandidate;
  const sendNow = useMutation({
    mutationFn: () => api.post(`/api/messages/${message.id}/send-now`),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error('Could not send it now', e.message),
  });
  const cancel = useMutation({
    mutationFn: () => unsendMessage(message.id),
    onSuccess: (back) => {
      onEdit(back.body, back.attachments);
      refresh();
    },
    onError: (e: Error) => toast.error('Could not cancel it', e.message),
  });
  const parts: ReactNode[] = [<span key="t">{timeOf(message.createdAt)}</span>];
  if (out) parts.push(<span key="a">{message.authorName ?? message.authorEmail ?? 'Team'}</span>);
  if (message.channel === 'Email') parts.push(<span key="c">by email</span>);
  if (message.fromAddress) parts.push(<span key="f">from {message.fromAddress}</span>);
  if (out && !message.scheduledFor) parts.push(<DeliveryStatus key="d" message={message} />);
  return (
    <div>
      <ChatBubble
        direction={out ? 'out' : 'in'}
        footer={parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 && <span aria-hidden>·</span>}
            {part}
          </Fragment>
        ))}
        files={
          message.attachments.length > 0 &&
          message.attachments.map((file) => (
            <FileCard
              key={file.id}
              name={file.name}
              size={formatSize(file.size)}
              href={`/api/attachments/${file.id}`}
            />
          ))
        }
      >
        <MessageBody
          body={message.body}
          markdown={out}
          className={cn(message.scheduledFor && 'opacity-80')}
        />
      </ChatBubble>
      {message.scheduledFor && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-2xs">
          <span className="inline-flex items-center gap-1 font-medium text-tone-amber-fg">
            <Clock className="size-3.5" aria-hidden />
            Sends {whenText(message.scheduledFor)}
          </span>
          <Button
            variant="link"
            size="xs"
            loading={sendNow.isPending}
            onClick={() => sendNow.mutate()}
          >
            Send now
          </Button>
          <Button
            variant="link"
            size="xs"
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel and edit
          </Button>
        </div>
      )}
      {message.originalBody && (
        <div className={cn('mt-1 flex flex-col', out ? 'items-end' : 'items-start')}>
          <Button variant="link" size="xs" onClick={() => setFull(!full)} aria-expanded={full}>
            {full ? 'Hide full email' : 'Show full email'}
          </Button>
          {full && (
            <pre className="mt-1 max-h-80 w-full max-w-[600px] overflow-auto rounded-lg border border-border-subtle bg-muted p-3 font-sans text-xs whitespace-pre-wrap text-fg-muted">
              {message.originalBody}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryStatus({ message }: { message: ThreadMessage }) {
  if (message.delivery === 'failed' || message.delivery === 'bounced')
    return (
      <span className="font-medium text-tone-red-fg" title={message.deliveryError ?? undefined}>
        {message.delivery === 'bounced' ? 'Email bounced' : 'Email not sent'}
      </span>
    );
  if (message.readAt)
    return (
      <span className="inline-flex items-center gap-0.5 text-accent-foreground">
        Seen <CheckCheck className="size-3.5" aria-hidden />
      </span>
    );
  const label = {
    sending: 'Sending…',
    sent: 'Sent',
    delivered: 'Delivered',
    opened: 'Opened',
  }[message.delivery ?? 'sent'];
  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      {(message.delivery === 'delivered' || message.delivery === 'opened') && (
        <CheckCheck className="size-3.5" aria-hidden />
      )}
    </span>
  );
}
