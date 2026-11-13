'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  FileText,
  Info,
  Paperclip,
  Send,
  Star,
  X,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  DescriptionList,
  FileButton,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RowActions,
  Separator,
  Textarea,
  toast,
} from '@/components/ui';
import { ChatBubble, DayDivider } from '@/components/messages/Chat';
import { StageBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { useLocalStorageState } from '@/lib/hooks';
import type { Conversation } from '../sample-messages';
import { emptyDraft, useMessages } from './MessagesShell';
import { candidateValues, fillTemplate, variableLabel } from './template-vars';

const formatSize = (b: number) =>
  b < 1024
    ? `${b} B`
    : b < 1024 ** 2
      ? `${Math.round(b / 1024)} KB`
      : `${(b / 1024 ** 2).toFixed(1)} MB`;
const formatWhen = (v: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(v));

/** One conversation: header, messages, composer, and a closable candidate details rail. */
export const Thread = forwardRef<
  HTMLTextAreaElement,
  { c: Conversation; onClose: () => void; closeLabel: string; back?: boolean }
>(function Thread({ c, onClose, closeLabel, back }, replyRef) {
  const { patch, cancelScheduled } = useMessages();
  // Remembered on wide screens; on phones the rail would cover the thread, so it starts closed.
  const [railPref, setRailPref] = useLocalStorageState('ats-preview:messages-rail', true);
  const [phoneRail, setPhoneRail] = useState(false);
  const rail = back ? phoneRail : railPref;
  const setRail = back ? setPhoneRail : setRailPref;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [c.id, c.messages.length]);
  const now = Date.now();

  return (
    <div className="@container relative flex h-full min-h-0 overflow-hidden rounded-xl border border-border-subtle bg-card shadow-card">
      <section aria-label={`Conversation with ${c.name}`} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-3 sm:px-4">
          {back && (
            <IconButton label={closeLabel} variant="quiet" size="sm" onClick={onClose}>
              <ArrowLeft />
            </IconButton>
          )}
          <Avatar name={c.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-fg">{c.name}</p>
            <p className="truncate text-xs text-fg-subtle">{c.email}</p>
          </div>
          <IconButton
            label={c.starred ? 'Remove star' : 'Star conversation'}
            variant="quiet"
            size="sm"
            aria-pressed={c.starred}
            onClick={() => patch(c.id, { starred: !c.starred })}
          >
            <Star className={cn(c.starred && 'fill-current text-tone-amber-dot')} />
          </IconButton>
          <IconButton
            label={rail ? 'Hide candidate details' : 'Show candidate details'}
            variant="quiet"
            size="sm"
            aria-pressed={rail}
            onClick={() => setRail(!rail)}
          >
            <Info />
          </IconButton>
          <RowActions label="Conversation actions">
            <MenuItem
              onSelect={() => {
                patch(c.id, { unread: true });
                onClose();
              }}
            >
              Mark as unread
            </MenuItem>
            <MenuItem
              onSelect={() => {
                patch(c.id, { archived: !c.archived });
                toast.success(c.archived ? 'Moved to inbox' : 'Conversation archived', c.name);
              }}
            >
              {c.archived ? 'Move to inbox' : 'Archive'}
            </MenuItem>
          </RowActions>
          {!back && (
            <IconButton label={closeLabel} variant="quiet" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          )}
        </header>

        <div
          ref={scroller}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
          aria-live="polite"
        >
          <DayDivider>{c.day}</DayDivider>
          {c.messages.map((m) => {
            const pending = !!m.scheduledFor && new Date(m.scheduledFor).getTime() > now;
            return (
              <div key={m.id}>
                <ChatBubble
                  direction={m.direction}
                  delivered={m.delivered && !pending}
                  time={
                    pending ? (
                      <span className="inline-flex items-center gap-1 text-tone-amber-fg">
                        <CalendarClock className="size-3.5" aria-hidden />
                        Scheduled for {formatWhen(m.scheduledFor!)}
                      </span>
                    ) : (
                      m.time
                    )
                  }
                >
                  {m.body}
                  {m.attachments && m.attachments.length > 0 && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((f) => (
                        <span
                          key={f.name}
                          className="inline-flex items-center gap-1 rounded-md bg-card/20 px-2 py-0.5 text-xs"
                        >
                          <Paperclip className="size-3" aria-hidden />
                          {f.name}
                        </span>
                      ))}
                    </span>
                  )}
                </ChatBubble>
                {pending && (
                  <div className="mt-1 flex justify-end">
                    <Button variant="link" size="xs" onClick={() => cancelScheduled(c.id, m.id)}>
                      Cancel and edit
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Composer c={c} ref={replyRef} />
      </section>

      {rail && (
        <aside
          aria-label="Candidate details"
          className="absolute inset-0 z-[2] overflow-y-auto bg-card p-5 @2xl:static @2xl:w-64 @2xl:shrink-0 @2xl:border-l @2xl:border-border-subtle"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-md font-semibold text-fg">Candidate details</h2>
            <IconButton
              label="Close candidate details"
              variant="quiet"
              size="sm"
              onClick={() => setRail(false)}
            >
              <X />
            </IconButton>
          </div>
          <div className="mt-4 flex flex-col items-center text-center">
            <Avatar name={c.name} size="xl" />
            <p className="mt-3 text-base font-semibold text-fg">{c.name}</p>
            <p className="text-xs text-fg-subtle">{c.role}</p>
            <div className="mt-2">
              <StageBadge stage={c.stage} />
            </div>
            <Link
              href="/candidates"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              View full profile <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <Separator className="my-4" />
          <DescriptionList
            items={[
              { label: 'Phone', value: c.phone },
              { label: 'Location', value: c.location },
            ]}
          />
          {c.nextInterview && (
            <div className="mt-5 rounded-lg bg-accent p-4">
              <p className="text-sm font-semibold text-fg">Next interview</p>
              <p className="mt-1 text-xs text-fg-muted">{c.nextInterview.title}</p>
              <p className="text-xs text-fg-muted">{c.nextInterview.when}</p>
              <Link
                href="/interviews"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
              >
                View interview <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </aside>
      )}
    </div>
  );
});

const Composer = forwardRef<HTMLTextAreaElement, { c: Conversation }>(function Composer(
  { c },
  ref,
) {
  const { drafts, setDraft, send, templates } = useMessages();
  const draft = drafts[c.id] ?? emptyDraft;
  const set = (patch: Partial<typeof draft>) => setDraft(c.id, { ...draft, ...patch });
  const firstName = c.name.split(' ')[0];
  const submit = () => {
    if (!draft.text.trim()) return;
    if (draft.scheduledFor && new Date(draft.scheduledFor).getTime() <= Date.now()) {
      toast.error('Pick a time in the future', 'Or clear the schedule to send now.');
      return;
    }
    send(c.id, draft);
    toast.success(
      draft.scheduledFor ? `Scheduled for ${formatWhen(draft.scheduledFor)}` : 'Message added',
      'This is a preview, so nothing was sent.',
    );
  };
  const insertTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const { text, missing } = fillTemplate(t.body, candidateValues(c));
    set({ text: draft.text.trim() ? `${draft.text.trimEnd()}\n\n${text}` : text });
    if (missing.length)
      toast(
        `Fill in by hand: ${missing.map(variableLabel).join(', ')}`,
        `We don’t have this for ${c.name} yet.`,
      );
  };
  const minDate = new Date(Date.now() + 5 * 60_000);
  const min = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}T${String(minDate.getHours()).padStart(2, '0')}:${String(minDate.getMinutes()).padStart(2, '0')}`;

  return (
    <form
      className="space-y-2 border-t border-border-subtle px-3 py-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={ref}
        label="Reply by email"
        placeholder={`Write your message to ${firstName}…`}
        minRows={2}
        maxRows={8}
        value={draft.text}
        onChange={(e) => set({ text: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      {(draft.attachments.length > 0 || draft.scheduledFor) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attachments and schedule">
          {draft.attachments.map((f) => (
            <li key={f.name}>
              <Badge size="md" icon={<FileText className="size-3.5" />}>
                {f.name} · {formatSize(f.size)}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="ml-1 rounded-full hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() =>
                    set({ attachments: draft.attachments.filter((x) => x.name !== f.name) })
                  }
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
          {draft.scheduledFor && (
            <li>
              <Badge size="md" tone="amber" icon={<CalendarClock className="size-3.5" />}>
                Sends {formatWhen(draft.scheduledFor)}
                <button
                  type="button"
                  aria-label="Clear schedule"
                  className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => set({ scheduledFor: '' })}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="quiet" size="sm" leftIcon={<FileText />}>
              Template
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Insert a template</MenuLabel>
            {templates.map((t) => (
              <MenuItem key={t.id} onSelect={() => insertTemplate(t.id)}>
                {t.name}
              </MenuItem>
            ))}
            {templates.length === 0 && <MenuItem disabled>No templates yet</MenuItem>}
          </MenuContent>
        </Menu>
        <FileButton
          variant="quiet"
          size="sm"
          leftIcon={<Paperclip />}
          onFile={(f) => {
            if (draft.attachments.some((x) => x.name === f.name)) return;
            set({ attachments: [...draft.attachments, { name: f.name, size: f.size }] });
          }}
        >
          Attach
        </FileButton>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="quiet" size="sm" leftIcon={<CalendarClock />}>
              Schedule
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4">
            <Input
              type="datetime-local"
              label="Send at"
              min={min}
              value={draft.scheduledFor}
              onChange={(e) => set({ scheduledFor: e.currentTarget.value })}
            />
            <p className="mt-2 text-2xs text-fg-subtle">This is a preview, so nothing is sent.</p>
          </PopoverContent>
        </Popover>
        <Button
          type="submit"
          leftIcon={draft.scheduledFor ? <CalendarClock /> : <Send />}
          className="ml-auto"
          disabled={!draft.text.trim()}
        >
          {draft.scheduledFor ? 'Schedule send' : 'Send message'}
        </Button>
      </div>
    </form>
  );
});
