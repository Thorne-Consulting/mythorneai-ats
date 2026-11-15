'use client';

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlarmClock,
  Archive,
  CheckCheck,
  ChevronDown,
  Clock,
  FileText,
  Inbox,
  Keyboard,
  Mail,
  MailOpen,
  MailQuestion,
  PenSquare,
  Send,
  Star,
  UserCheck,
  UserRound,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { ConversationRow } from '@/components/messages/Chat';
import {
  CountBadge,
  EmptyState,
  IconButton,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  SearchInput,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { useAbility } from '@/lib/ability';
import { useDebouncedValue, useHotkeys, useHydrated, useLocalStorageState } from '@/lib/hooks';
import { ContextRail } from './ContextRail';
import {
  flattenInbox,
  folderInfo,
  folders,
  listTime,
  plainPreview,
  useInbox,
  whenText,
  useInboxCounts,
  useRefreshThreads,
  useThread,
  useThreadActions,
  type Folder,
  type InboxView,
} from './inbox-data';
import { useLiveThreads } from './live';
import { NewMessageModal } from './NewMessage';
import { Thread, type ThreadHandle } from './Thread';
import { UnmatchedList, UnmatchedReader } from './Unmatched';

const icons: Record<InboxView, LucideIcon> = {
  inbox: Inbox,
  assigned: UserCheck,
  unassigned: UserX,
  scheduled: Clock,
  snoozed: AlarmClock,
  unread: Mail,
  starred: Star,
  'awaiting-reply': Send,
  done: Archive,
  unmatched: MailQuestion,
};

/** Matches a media query; assumes desktop on the server. */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const href = (view: InboxView) => (view === 'inbox' ? '/messages' : `/messages/${view}`);

/**
 * The team inbox: conversations on the left, the open thread in the middle, candidate details on
 * the right (closed by default below 1600px). On phones the list and the thread each take the
 * whole screen, and Back returns to the list.
 */
export function InboxPage({ view = 'inbox' }: { view?: InboxView }) {
  useLiveThreads();
  const router = useRouter();
  const pathname = usePathname() ?? '/messages';
  const params = useSearchParams();
  const selected = params.get('thread');
  const selectedEmail = params.get('email');
  const wide = useMediaQuery('(min-width: 1024px)');
  const roomy = useMediaQuery('(min-width: 1600px)');
  const [railPref, setRailPref] = useLocalStorageState<boolean | null>('ats-messages-rail', null);
  const railOpen = railPref ?? roomy;
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q.trim(), 300);
  const [composing, setComposing] = useState(false);
  const [help, setHelp] = useState(false);
  const thread = useRef<ThreadHandle>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const lastChecked = useRef<string | null>(null);
  const user = useCurrentUser();
  // Email from unknown senders becomes a new candidate, so it is for people who add candidates.
  const seesUnmatched = useAbility().can('create', 'Candidate');
  const folder: Folder = view === 'unmatched' ? 'inbox' : view;
  const inbox = useInbox(folder, search);
  const counts = useInboxCounts();
  const rows = view === 'unmatched' ? [] : flattenInbox(inbox.data);
  const index = rows.findIndex((row) => row.applicationId === selected);
  const current = useThread(selected);
  const info = current.data?.pages[0]?.thread;
  const actions = useThreadActions(selected ?? '');
  const refresh = useRefreshThreads();
  const readAll = useMutation({
    mutationFn: () => api.post<{ marked: number }>('/api/inbox/read-all'),
    onSuccess: (result) => {
      refresh();
      toast.success(
        result.marked === 1
          ? 'Marked 1 conversation as read'
          : `Marked ${result.marked} conversations as read`,
      );
    },
    onError: (error: Error) => toast.error('Could not mark conversations as read', error.message),
  });

  const bulk = useMutation({
    mutationFn: (input: {
      action: 'done' | 'reopen' | 'read' | 'unread' | 'assign';
      assignee?: string;
    }) =>
      api.post<{ changed: number }>('/api/inbox/bulk', { applicationIds: [...checked], ...input }),
    onSuccess: (result, input) => {
      const ids = [...checked];
      refresh();
      setChecked(new Set());
      const n = result.changed === 1 ? '1 conversation' : `${result.changed} conversations`;
      const words = {
        done: `Marked ${n} done`,
        reopen: `Moved ${n} to the inbox`,
        read: `Marked ${n} as read`,
        unread: `Marked ${n} as unread`,
        assign: input.assignee ? `Assigned ${n} to you` : `Unassigned ${n}`,
      }[input.action];
      toast.success(
        words,
        undefined,
        input.action === 'done'
          ? {
              action: {
                label: 'Undo',
                onClick: () =>
                  api
                    .post('/api/inbox/bulk', { applicationIds: ids, action: 'reopen' })
                    .then(() => refresh()),
              },
            }
          : undefined,
      );
    },
    onError: (error: Error) => toast.error('Could not update those conversations', error.message),
  });
  const toggle = (id: string, on: boolean, range: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      const ids = rows.map((r) => r.applicationId);
      const from = lastChecked.current ? ids.indexOf(lastChecked.current) : -1;
      const to = ids.indexOf(id);
      const span =
        range && from >= 0 && to >= 0
          ? ids.slice(Math.min(from, to), Math.max(from, to) + 1)
          : [id];
      for (const one of span) {
        if (on) next.add(one);
        else next.delete(one);
      }
      lastChecked.current = id;
      return next;
    });
  // A different folder or search starts with nothing checked.
  useEffect(() => setChecked(new Set()), [view, search]);

  const open = (key: 'thread' | 'email', id: string | null, push = !wide) => {
    const next = new URLSearchParams(params.toString());
    next.delete('thread');
    next.delete('email');
    if (id) next.set(key, id);
    const url = next.size ? `${pathname}?${next}` : pathname;
    if (push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };

  // On desktop the first conversation opens by itself, like a reading pane.
  const first = rows[0]?.applicationId;
  useEffect(() => {
    if (wide && !selected && first && view !== 'unmatched') open('thread', first, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, selected, first, view]);

  const step = (dir: 1 | -1) => {
    if (!rows.length) return;
    const nextIndex =
      index < 0
        ? dir > 0
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, index + dir));
    open('thread', rows[nextIndex].applicationId, false);
    document
      .getElementById(`thread-${rows[nextIndex].applicationId}`)
      ?.scrollIntoView({ block: 'nearest' });
  };
  // After Done or Mark as unread, go to the next conversation (or back to the list on phones).
  const moveOn = () => {
    if (!wide) return open('thread', null, false);
    const rest = rows.filter((row) => row.applicationId !== selected);
    open(
      'thread',
      rest[Math.min(Math.max(index, 0), rest.length - 1)]?.applicationId ?? null,
      false,
    );
  };

  useHotkeys([
    ['j', () => step(1)],
    ['k', () => step(-1)],
    ['r', () => thread.current?.focus()],
    ['c', () => setComposing(true)],
    ['shift+?', () => setHelp(true)],
    ['mod+f', () => searchBox.current?.focus()],
    ['s', () => info && actions.patch.mutate({ starred: !info.starred })],
    ['x', () => selected && toggle(selected, !checked.has(selected), false)],
    ['a', () => info && document.getElementById(`assign-${info.applicationId}`)?.click()],
    ['h', () => info && document.getElementById(`snooze-${info.applicationId}`)?.click()],
    [
      'e',
      () => {
        if (!info) return;
        const done = !info.done;
        actions.patch.mutate(
          { done },
          {
            onSuccess: () =>
              done &&
              toast.success('Marked done', undefined, {
                action: { label: 'Undo', onClick: () => actions.patch.mutate({ done: false }) },
              }),
          },
        );
        if (done) moveOn();
      },
    ],
    [
      'u',
      () => {
        if (!info) return;
        actions.patch.mutate({ unread: true });
        moveOn();
      },
    ],
    [
      'escape',
      () => {
        if (checked.size) setChecked(new Set());
        else if (!wide && selected) open('thread', null, false);
      },
    ],
  ]);

  // The shell fills the counts cache before this Suspense boundary hydrates; show them after.
  const hydrated = useHydrated();
  const unread = hydrated ? (counts.data?.unread ?? 0) : 0;
  const unmatched = hydrated ? (counts.data?.unmatched ?? 0) : 0;
  const assigned = hydrated ? (counts.data?.assigned ?? 0) : 0;
  const { label, empty, emptyHint } = folderInfo[view];
  const Icon = icons[view];
  const showList = wide || (!selected && !selectedEmail);

  const list = (
    <section
      aria-label="Conversations"
      className="flex min-h-0 w-full flex-col lg:w-[300px] lg:shrink-0 lg:border-r lg:border-border-subtle xl:w-[340px]"
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="-ml-1 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-md font-semibold text-fg hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon className="size-[18px] shrink-0 text-fg-muted" aria-hidden />
              <span className="truncate">{label}</span>
              {view === 'inbox' && unread > 0 && <CountBadge count={unread} />}
              {view === 'assigned' && assigned > 0 && <CountBadge count={assigned} />}
              <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-60">
            {folders.map((f) => {
              const FolderIcon = icons[f];
              return (
                <MenuItem
                  key={f}
                  icon={<FolderIcon />}
                  onSelect={() => router.push(href(f))}
                  className={f === view ? 'bg-accent text-accent-foreground' : undefined}
                  shortcut={
                    f === 'inbox' && unread > 0
                      ? unread
                      : f === 'assigned' && assigned > 0
                        ? assigned
                        : undefined
                  }
                >
                  {folderInfo[f].label}
                </MenuItem>
              );
            })}
            {seesUnmatched && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<MailQuestion />}
                  onSelect={() => router.push(href('unmatched'))}
                  className={view === 'unmatched' ? 'bg-accent text-accent-foreground' : undefined}
                  shortcut={unmatched > 0 ? unmatched : undefined}
                >
                  {folderInfo.unmatched.label}
                </MenuItem>
              </>
            )}
            <MenuSeparator />
            {unread > 0 && (
              <MenuItem icon={<CheckCheck />} onSelect={() => readAll.mutate()}>
                Mark all as read
              </MenuItem>
            )}
            <MenuItem icon={<FileText />} onSelect={() => router.push('/messages/templates')}>
              Templates
            </MenuItem>
          </MenuContent>
        </Menu>
        <span className="flex-1" />
        <IconButton
          label="Keyboard shortcuts (?)"
          variant="quiet"
          size="sm"
          className="max-lg:hidden"
          onClick={() => setHelp(true)}
        >
          <Keyboard />
        </IconButton>
        <IconButton
          label="New message (c)"
          variant="quiet"
          size="sm"
          onClick={() => setComposing(true)}
        >
          <PenSquare />
        </IconButton>
      </div>
      {view !== 'unmatched' && (
        <div className="px-3 pb-3">
          <SearchInput
            ref={searchBox}
            value={q}
            onValueChange={setQ}
            placeholder="Search names, jobs, messages and files"
          />
        </div>
      )}
      {checked.size > 0 && (
        <div
          role="toolbar"
          aria-label="Selected conversations"
          className="flex flex-wrap items-center gap-1 border-t border-border-subtle bg-accent/50 px-2 py-1.5"
        >
          <IconButton
            label="Clear selection (Esc)"
            variant="quiet"
            size="sm"
            onClick={() => setChecked(new Set())}
          >
            <X />
          </IconButton>
          <span className="mr-auto text-sm font-medium text-fg tnum">{checked.size} selected</span>
          {view === 'done' ? (
            <IconButton
              label="Move to inbox"
              variant="quiet"
              size="sm"
              onClick={() => bulk.mutate({ action: 'reopen' })}
            >
              <Inbox />
            </IconButton>
          ) : (
            <IconButton
              label="Mark done"
              variant="quiet"
              size="sm"
              onClick={() => bulk.mutate({ action: 'done' })}
            >
              <Archive />
            </IconButton>
          )}
          <IconButton
            label="Mark as read"
            variant="quiet"
            size="sm"
            onClick={() => bulk.mutate({ action: 'read' })}
          >
            <CheckCheck />
          </IconButton>
          <IconButton
            label="Mark as unread"
            variant="quiet"
            size="sm"
            onClick={() => bulk.mutate({ action: 'unread' })}
          >
            <MailOpen />
          </IconButton>
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="Assign" variant="quiet" size="sm">
                <UserRound />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => bulk.mutate({ action: 'assign', assignee: user.email })}>
                Assign to me
              </MenuItem>
              <MenuItem onSelect={() => bulk.mutate({ action: 'assign', assignee: '' })}>
                Unassign
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border-subtle">
        {view === 'unmatched' ? (
          <UnmatchedList
            selected={selectedEmail}
            onOpen={(id) => open('email', id)}
            showEmpty={!wide}
          />
        ) : !inbox.data ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          // On desktop an empty folder says so once, in the reading pane.
          (!wide || search) && (
            <EmptyState
              compact
              icon={Icon}
              title={search ? 'No conversations match' : empty}
              description={search ? 'Try a name, a job or words from a message.' : emptyHint}
            />
          )
        ) : (
          <>
            {rows.map((row) => (
              <div key={row.applicationId} id={`thread-${row.applicationId}`}>
                <ConversationRow
                  name={row.candidateName}
                  subtitle={`${row.jobTitle} · ${row.stage}`}
                  preview={
                    row.snippet ? (
                      <Highlighted text={row.snippet} />
                    ) : (
                      `${row.lastFromCandidate ? '' : row.lastAuthorEmail === user.email ? 'You: ' : 'Team: '}${plainPreview(row.preview)}`
                    )
                  }
                  time={
                    view === 'snoozed' && row.snoozedUntil
                      ? whenText(row.snoozedUntil)
                      : view === 'scheduled' && row.scheduledFor
                        ? whenText(row.scheduledFor)
                        : listTime(row.lastAt)
                  }
                  unread={row.unread}
                  starred={row.starred}
                  hasFiles={row.hasFiles}
                  viaEmail={row.lastChannel === 'Email'}
                  scheduled={!!row.scheduledFor}
                  snoozed={!!row.snoozedUntil && new Date(row.snoozedUntil) > new Date()}
                  assignee={row.assigneeEmail === user.email ? null : row.assigneeName}
                  selected={row.applicationId === selected}
                  checked={checked.has(row.applicationId)}
                  selecting={checked.size > 0}
                  onCheck={(on, range) => toggle(row.applicationId, on, range)}
                  onClick={() => open('thread', row.applicationId)}
                />
              </div>
            ))}
            <LoadMore
              hasMore={!!inbox.hasNextPage}
              loading={inbox.isFetchingNextPage}
              onMore={() => inbox.fetchNextPage()}
            />
          </>
        )}
      </div>
    </section>
  );

  const reading =
    view === 'unmatched' ? (
      selectedEmail ? (
        <UnmatchedReader
          id={selectedEmail}
          onBack={wide ? undefined : () => open('email', null, false)}
          onDone={() => open('email', null, false)}
        />
      ) : (
        <EmptyState
          icon={MailQuestion}
          title={unmatched === 0 ? folderInfo.unmatched.empty : 'Pick an email to sort'}
          description={
            unmatched === 0
              ? folderInfo.unmatched.emptyHint
              : 'Add it to the right conversation, or discard it.'
          }
          className="m-auto"
        />
      )
    ) : selected ? (
      <Thread
        key={selected}
        ref={thread}
        applicationId={selected}
        onBack={wide ? undefined : () => open('thread', null, false)}
        railOpen={railOpen}
        onToggleRail={wide ? () => setRailPref(!railOpen) : undefined}
        onLeave={moveOn}
      />
    ) : (
      <EmptyState
        icon={Icon}
        title={inbox.data && rows.length === 0 && !search ? empty : 'Pick a conversation'}
        description={
          inbox.data && rows.length === 0 && !search
            ? emptyHint
            : 'Or press c to write a new message.'
        }
        className="m-auto"
      />
    );

  return (
    <div className="-my-2 h-[calc(100dvh-64px-2rem)] min-h-[480px] md:h-[calc(100dvh-77px-2rem)] lg:-my-4 lg:h-[calc(100dvh-77px-2rem)]">
      <h1 className="sr-only">Messages</h1>
      <div className="@container relative flex h-full overflow-hidden rounded-xl border border-border-subtle bg-card shadow-card">
        {showList && list}
        {(wide || selected || selectedEmail) && (
          <div className="flex min-h-0 min-w-0 flex-1">{reading}</div>
        )}
        {wide && view !== 'unmatched' && selected && railOpen && info && (
          <ContextRail info={info} onClose={() => setRailPref(false)} />
        )}
      </div>
      <NewMessageModal
        opened={composing}
        onClose={() => setComposing(false)}
        onChoose={(applicationId) => {
          setComposing(false);
          router.push(`/messages?thread=${applicationId}`);
          setTimeout(() => thread.current?.focus(), 400);
        }}
      />
      <ShortcutSheet opened={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function LoadMore({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && !loading && onMore(),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onMore]);
  if (!hasMore) return null;
  return (
    <div ref={sentinel}>
      <SkeletonRows rows={2} />
    </div>
  );
}

const shortcuts: [string[], string][] = [
  [['j'], 'Next conversation'],
  [['k'], 'Previous conversation'],
  [['r'], 'Reply'],
  [['⌘', 'Enter'], 'Send'],
  [['e'], 'Mark done, or move back to the inbox'],
  [['s'], 'Star or remove the star'],
  [['a'], 'Assign'],
  [['h'], 'Snooze'],
  [['x'], 'Select for bulk actions (Shift and click selects a range)'],
  [['u'], 'Mark as unread'],
  [['c'], 'New message'],
  [['⌘', 'F'], 'Search conversations'],
  [['?'], 'Show these shortcuts'],
];

function ShortcutSheet({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <dl className="divide-y divide-border-subtle">
        {shortcuts.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-fg">{what}</dt>
            <dd className="flex shrink-0 gap-1">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** A search snippet with the matched words (between <mark> tags from the server) highlighted. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/<mark>|<\/mark>/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 ? (
          <mark key={index} className="rounded-xs bg-tone-amber-bg px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
