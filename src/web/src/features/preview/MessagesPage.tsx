'use client';

import { useRef, useState } from 'react';
import { Inbox } from 'lucide-react';
import { EmptyState, Kbd, SearchInput, SkeletonRows, SplitView, toast } from '@/components/ui';
import { ConversationRow } from '@/components/messages/Chat';
import { useHotkeys } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { inFolder, useMediaQuery, useMessages, type Folder } from './messages/MessagesShell';
import { Thread } from './messages/Thread';

const folderTitles: Record<Folder, { title: string; empty: string }> = {
  inbox: { title: 'Inbox', empty: 'New conversations with candidates show up here.' },
  unread: { title: 'Unread', empty: 'You’re all caught up.' },
  starred: { title: 'Starred', empty: 'Star a conversation to find it here quickly.' },
  sent: { title: 'Sent', empty: 'Conversations waiting for the candidate to reply show up here.' },
  archived: { title: 'Archived', empty: 'Conversations you archive show up here.' },
};

/** A folder of conversations (list) with the open thread beside it. */
export function MessagesPage({ folder = 'inbox' }: { folder?: Folder }) {
  const { conversations, ready, selectedId, setSelectedId, patch } = useMessages();
  const [search, setSearch] = useState('');
  const reply = useRef<HTMLTextAreaElement>(null);
  const wide = useMediaQuery('(min-width: 1024px)');

  const q = search.trim().toLowerCase();
  const list = conversations.filter(
    (c) =>
      inFolder(c, folder) &&
      (!q || `${c.name} ${c.role} ${c.messages.at(-1)?.body ?? ''}`.toLowerCase().includes(q)),
  );
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const index = selected ? list.findIndex((c) => c.id === selected.id) : -1;

  const open = (id: string) => {
    setSelectedId(id);
    patch(id, { unread: false });
  };
  const step = (dir: 1 | -1) => {
    if (!list.length) return;
    const next =
      index < 0
        ? dir > 0
          ? 0
          : list.length - 1
        : Math.min(list.length - 1, Math.max(0, index + dir));
    open(list[next].id);
    document.getElementById(`conversation-${list[next].id}`)?.scrollIntoView({ block: 'nearest' });
  };
  useHotkeys([
    ['j', () => step(1)],
    ['k', () => step(-1)],
    ['r', () => selected && reply.current?.focus()],
    [
      'e',
      () => {
        if (!selected) return;
        patch(selected.id, { archived: !selected.archived });
        toast.success(
          selected.archived ? 'Moved to inbox' : 'Conversation archived',
          selected.name,
        );
        // Move on to the next conversation still in this folder.
        const rest = list.filter((c) => c.id !== selected.id);
        if (inFolder({ ...selected, archived: !selected.archived }, folder)) return;
        setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
      },
    ],
  ]);

  const { title, empty } = folderTitles[folder];
  const listCard = (
    <section
      aria-label={title}
      className="flex h-[calc(100dvh-17rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-card shadow-card"
    >
      <div className="space-y-3 px-4 pt-4 pb-3">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <SearchInput value={search} onValueChange={setSearch} placeholder="Search conversations" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border-subtle">
        {!ready ? (
          <SkeletonRows rows={6} />
        ) : list.length === 0 ? (
          <EmptyState
            compact
            icon={Inbox}
            title={q ? 'No matches' : 'Nothing here'}
            description={q ? 'Try another search.' : empty}
          />
        ) : (
          list.map((c) => (
            <div key={c.id} id={`conversation-${c.id}`}>
              <ConversationRow
                name={c.name}
                subtitle={c.role}
                preview={c.messages.at(-1)?.body}
                time={c.time}
                unread={c.unread}
                selected={c.id === selected?.id}
                onClick={() => open(c.id)}
              />
            </div>
          ))
        )}
      </div>
      <p className="hidden border-t border-border-subtle px-4 py-2 text-2xs text-fg-subtle lg:block">
        <Kbd>j</Kbd> <Kbd>k</Kbd> to move · <Kbd>r</Kbd> to reply · <Kbd>e</Kbd> to archive
      </p>
    </section>
  );

  const thread = selected && (
    <div className="h-[calc(100dvh-17rem)] min-h-[480px]">
      <Thread
        ref={reply}
        c={selected}
        back={!wide}
        closeLabel={wide ? 'Close conversation' : 'Back to list'}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );

  // Below lg there is room for one pane: the open thread replaces the list.
  if (!wide) return selected ? thread : listCard;
  return (
    <SplitView
      storageKey="messages-thread"
      sideOpen={!!selected}
      defaultWidth={680}
      min={440}
      max={900}
      main={<div className={cn(selected && 'min-w-[260px]')}>{listCard}</div>}
      side={thread}
    />
  );
}
