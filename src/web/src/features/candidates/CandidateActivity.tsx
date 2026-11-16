'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  EyeOff,
  FileText,
  Handshake,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  StickyNote,
  Trash2,
  UserRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  RowActions,
  MenuItem,
  MenuSeparator,
  Select,
  SkeletonRows,
  Tooltip,
  toast,
  type Tone,
} from '@/components/ui';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { RichText } from '@/components/rich-text';
import { useAbility } from '@/lib/ability';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { CandidateDetail } from '@/types';

/** GET /api/candidates/{id}/activity */
export type ActivityItem = {
  id: string;
  type: string;
  at: string;
  actorEmail?: string | null;
  actorName?: string | null;
  applicationId?: string | null;
  job?: string | null;
  title: string;
  body?: string | null;
  data?: {
    noteId?: string;
    isPrivate?: boolean;
    editedAt?: string | null;
    pinnedAt?: string | null;
    mine?: boolean;
    status?: string | null;
    recommendation?: string | null;
    hidden?: boolean;
    deliveryStatus?: string | null;
    startsAt?: string;
    /** A workflow step's run, sent to admins only. */
    runHref?: string | null;
  } | null;
};
type ActivityPage = { items: ActivityItem[]; pinned: ActivityItem[]; next: string | null };
type Person = { email: string; name: string; role: string; access: boolean };

const FILTERS = [
  { value: 'all', label: 'All', types: '' },
  { value: 'notes', label: 'Notes', types: 'note' },
  { value: 'emails', label: 'Emails', types: 'message,email', details: true },
  { value: 'interviews', label: 'Interviews', types: 'interview' },
  { value: 'feedback', label: 'Feedback', types: 'feedback' },
  { value: 'moves', label: 'Stages', types: 'application,stage,offer,dismissal' },
  { value: 'files', label: 'Files', types: 'file' },
];

const ICONS: Record<string, LucideIcon> = {
  note: StickyNote,
  application: Briefcase,
  stage: ArrowRightLeft,
  message: MessageSquare,
  email: Mail,
  interview: CalendarDays,
  feedback: ClipboardCheck,
  offer: Handshake,
  file: FileText,
  dismissal: EyeOff,
  profile: UserRound,
  workflow: Workflow,
};

/** Colour follows meaning: blue interviews, amber offers, red rejections, green hires. */
function toneOf(item: ActivityItem): Tone {
  if (item.type === 'interview')
    return item.title.startsWith('Interview cancelled') ? 'gray' : 'blue';
  if (item.type === 'offer') return item.title === 'Offer accepted' ? 'green' : 'amber';
  if (item.type === 'stage' && item.data?.status === 'Rejected') return 'red';
  if (item.type === 'stage' && item.data?.status === 'Hired') return 'green';
  if (item.type === 'dismissal') return 'red';
  return 'gray';
}
const discTone: Record<Tone, string> = {
  blue: 'bg-tone-blue-bg text-tone-blue-fg',
  violet: 'bg-tone-violet-bg text-tone-violet-fg',
  green: 'bg-tone-green-bg text-tone-green-fg',
  amber: 'bg-tone-amber-bg text-tone-amber-fg',
  red: 'bg-tone-red-bg text-tone-red-fg',
  gray: 'bg-muted text-fg-muted',
};

/** "Today", "Yesterday", or "Monday, November 10". */
function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** The people "@" offers, with those who cannot see this person grouped apart. */
export function useMentionPeople(candidateId: string) {
  return useQuery({
    queryKey: ['candidate-people', candidateId],
    queryFn: () => api.get<Person[]>(`/api/candidates/${candidateId}/people`),
    staleTime: 60_000,
  });
}

const mentionKeys = (markdown: string) =>
  [...markdown.matchAll(/\]\(mention:([^)\s]+)\)/g)].map((match) =>
    decodeURIComponent(match[1]).toLowerCase(),
  );

/**
 * Write or edit a note: the shared editor with "@" for teammates, which job it is about, and who can
 * read it. ⌘Enter posts. Mentioning someone who cannot see this person asks first.
 */
function NoteEditor({
  candidate,
  initial,
  onCancel,
  onSaved,
}: {
  candidate: CandidateDetail;
  initial?: { noteId: string; body: string; isPrivate: boolean };
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  // Private notes: people who can pin and mark notes (recruiters, hiring managers, admins).
  const canMarkPrivate = useAbility().can('update', 'Note');
  const [body, setBody] = useState(initial?.body ?? '');
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const people = useMentionPeople(candidate.id);
  const chips = useMemo(
    () => ({
      people: (people.data ?? [])
        .filter((person) => person.email !== user.email.toLowerCase())
        .map((person) => ({
          key: person.email,
          text: person.name,
          group: person.access ? undefined : 'Cannot see this candidate',
        })),
    }),
    [people.data, user.email],
  );
  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.put(`/api/notes/${initial.noteId}`, { body, isPrivate })
        : api.post(`/api/candidates/${candidate.id}/notes`, { body, applicationId, isPrivate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-activity', candidate.id] });
      toast.success(initial ? 'Note saved' : 'Note added');
      setBody('');
      onSaved();
    },
    onError: (error: Error) => toast.error('Could not save the note', error.message),
  });
  const empty = !body.trim();
  const submit = () => {
    if (empty || save.isPending) return;
    const blind = mentionKeys(body)
      .map((key) => people.data?.find((person) => person.email === key))
      .filter((person): person is Person => Boolean(person && !person.access))
      .map((person) => person.name);
    if (blind.length) setConfirm(blind);
    else save.mutate();
  };
  const name = candidate.firstName;
  return (
    <div
      className="space-y-3 [&_[data-slate-editor]]:min-h-24"
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
    >
      <PlateMarkdownEditor
        value={body}
        onChange={setBody}
        placeholder={`Write a note about ${name}. Type @ to mention a teammate.`}
        chips={chips}
        images={false}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!initial && candidate.applications.length > 0 && (
          <Select
            size="sm"
            aria-label="Which job the note is about"
            className="w-56"
            value={applicationId ?? 'none'}
            onChange={(value) => setApplicationId(value === 'none' ? null : value)}
            data={[
              { value: 'none', label: 'Not about one job' },
              ...candidate.applications.map((app) => ({
                value: app.id,
                label: app.requisitionTitle,
              })),
            ]}
          />
        )}
        {canMarkPrivate && (
          <Checkbox
            label="Only recruiters and hiring managers"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
        )}
        <span className="ml-auto flex items-center gap-2">
          {onCancel && (
            <Button size="sm" variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Tooltip label="⌘ Enter">
            <Button size="sm" disabled={empty} loading={save.isPending} onClick={submit}>
              {initial ? 'Save note' : 'Add note'}
            </Button>
          </Tooltip>
        </span>
      </div>
      <ConfirmDialog
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          save.mutate();
        }}
        title="Mention someone who cannot see this candidate?"
        message={`${confirm?.join(' and ')} cannot open ${name}'s record yet, so they will see the mention but not the note. Add them to the job first if they should read it.`}
        confirmLabel="Add note anyway"
        confirmVariant="primary"
      />
    </div>
  );
}

/** A note in the feed: who wrote it, the text, and its menu (pin, edit and delete your own). */
function NoteCard({
  item,
  candidate,
  canPin,
}: {
  item: ActivityItem;
  candidate: CandidateDetail;
  canPin: boolean;
}) {
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const data = item.data ?? {};
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['candidate-activity', candidate.id] });
  const pin = useMutation({
    mutationFn: (on: boolean) =>
      on
        ? api.put(`/api/notes/${data.noteId}/pin`, {})
        : api.delete(`/api/notes/${data.noteId}/pin`),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/notes/${data.noteId}`),
    onSuccess: () => {
      refresh();
      toast.success('Note deleted');
    },
    onError: (error: Error) => toast.error('Could not delete the note', error.message),
  });
  const canDelete = data.mine || ability.can('delete', 'Note');
  return (
    <div
      id={`note-${data.noteId}`}
      className="min-w-0 flex-1 scroll-mt-24 rounded-lg border border-border-subtle bg-card px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          <span className="font-medium text-fg">{item.actorName ?? 'Someone'}</span>
          {' · '}
          <time dateTime={item.at} title={formatDateTime(item.at)}>
            {formatRelative(item.at)}
          </time>
          {data.editedAt && <span title={formatDateTime(data.editedAt)}> · edited</span>}
          {item.job && item.applicationId && (
            <>
              {' · '}
              <JobLink item={item} className="align-bottom" />
            </>
          )}
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {data.isPrivate && (
            <Tooltip label="Only recruiters and hiring managers can read this">
              <Badge size="sm" tone="gray">
                <Lock className="size-3" aria-hidden /> Private
              </Badge>
            </Tooltip>
          )}
          {data.pinnedAt && (
            <Badge size="sm" tone="amber">
              <Pin className="size-3" aria-hidden /> Pinned
            </Badge>
          )}
          {(canPin || data.mine || canDelete) && (
            <RowActions label="Note actions">
              {canPin && (
                <MenuItem
                  icon={data.pinnedAt ? <PinOff /> : <Pin />}
                  onSelect={() => pin.mutate(!data.pinnedAt)}
                >
                  {data.pinnedAt ? 'Unpin' : 'Pin to the top'}
                </MenuItem>
              )}
              {data.mine && (
                <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
                  Edit
                </MenuItem>
              )}
              {canDelete && (
                <>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(true)}>
                    Delete…
                  </MenuItem>
                </>
              )}
            </RowActions>
          )}
        </span>
      </div>
      <div className="mt-2">
        {editing ? (
          <NoteEditor
            candidate={candidate}
            initial={{ noteId: data.noteId!, body: item.body ?? '', isPrivate: !!data.isPrivate }}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        ) : (
          <RichText markdown={item.body} className="text-base text-fg" />
        )}
      </div>
      <ConfirmDialog
        opened={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutateAsync().then(
            () => setDeleting(false),
            () => undefined,
          )
        }
        title="Delete this note?"
        message="It is removed for everyone. You cannot undo this."
        confirmLabel="Delete note"
      />
    </div>
  );
}

function JobLink({ item, className }: { item: ActivityItem; className?: string }) {
  return (
    <Link
      href={`/applications/${item.applicationId}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate text-xs text-accent-foreground hover:underline',
        className,
      )}
    >
      <Briefcase className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{item.job}</span>
    </Link>
  );
}

/** One line in the feed for everything that is not a note. */
function EventRow({ item }: { item: ActivityItem }) {
  const extra: ReactNode =
    item.type === 'feedback' && item.data?.recommendation ? (
      <Badge size="sm" tone="gray">
        {item.data.recommendation}
      </Badge>
    ) : item.type === 'email' && item.data?.deliveryStatus ? (
      <Badge size="sm" tone={item.data.deliveryStatus === 'bounced' ? 'red' : 'gray'}>
        {item.data.deliveryStatus === 'bounced' ? 'Bounced' : item.data.deliveryStatus}
      </Badge>
    ) : null;
  return (
    <div className="min-w-0 flex-1 pt-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-fg">
        <span className="font-medium">{item.title}</span>
        {extra}
      </p>
      {item.body && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{item.body}</p>}
      <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
        {item.actorName && <span>{item.actorName}</span>}
        <time dateTime={item.at} title={formatDateTime(item.at)}>
          {new Date(item.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </time>
        {item.job && item.applicationId && item.type !== 'application' && <JobLink item={item} />}
        {item.type === 'message' && item.applicationId && (
          <Link
            href={`/messages?thread=${item.applicationId}`}
            className="text-accent-foreground hover:underline"
          >
            Open in Messages
          </Link>
        )}
        {item.data?.runHref && (
          <Link href={item.data.runHref} className="text-accent-foreground hover:underline">
            See the run
          </Link>
        )}
      </p>
    </div>
  );
}

/**
 * The person's Overview: a note composer, pinned notes, then everything that happened across the
 * jobs you can see, newest first and grouped by day, with filters.
 */
export function CandidateActivity({ candidate }: { candidate: CandidateDetail }) {
  const ability = useAbility();
  const canPin = ability.can('update', 'Note');
  const [filter, setFilter] = useState('all');
  const [composer, setComposer] = useState(0);
  // Emails and stage details come back only for people who read messages.
  const filters = FILTERS.filter((item) => !item.details || ability.can('read', 'Message'));
  const types = FILTERS.find((item) => item.value === filter)?.types ?? '';
  const feed = useInfiniteQuery({
    queryKey: ['candidate-activity', candidate.id, types],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api.get<ActivityPage>(
        `/api/candidates/${candidate.id}/activity?limit=30${types ? `&types=${types}` : ''}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const pinned = feed.data?.pages[0]?.pinned ?? [];
  const pinnedIds = new Set(pinned.map((item) => item.id));
  const items = (feed.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => !pinnedIds.has(item.id),
  );
  const days: { label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    if (days.at(-1)?.label === label) days.at(-1)!.items.push(item);
    else days.push({ label, items: [item] });
  }

  const row = (item: ActivityItem) => {
    const Icon = ICONS[item.type] ?? UserRound;
    return (
      <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
        <span
          aria-hidden
          className="absolute top-9 bottom-0 left-4 w-px bg-border-subtle [li:last-child>&]:hidden"
        />
        {item.type === 'note' ? (
          <span aria-hidden className="relative">
            <Avatar name={item.actorName ?? '?'} size="sm" />
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              'relative inline-flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
              discTone[toneOf(item)],
            )}
          >
            <Icon strokeWidth={1.75} />
          </span>
        )}
        {item.type === 'note' ? (
          <NoteCard item={item} candidate={candidate} canPin={canPin} />
        ) : (
          <EventRow item={item} />
        )}
      </li>
    );
  };

  return (
    <Card className="px-4 py-4 sm:px-5">
      <div className="mb-4">
        <h2 className="mb-3 text-lg font-semibold text-fg">Activity</h2>
        <NoteEditor
          key={composer}
          candidate={candidate}
          onSaved={() => setComposer((n) => n + 1)}
        />
      </div>
      {pinned.length > 0 && filter === 'all' && (
        <section aria-label="Pinned notes" className="mb-5 space-y-3">
          <ul>{pinned.map(row)}</ul>
        </section>
      )}
      <div
        role="group"
        aria-label="Show"
        className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto border-t border-border-subtle px-1 pt-4"
      >
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              'h-7 shrink-0 rounded-full border border-border px-3 text-xs text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
              filter === item.value &&
                'border-primary/40 bg-accent font-medium text-accent-foreground hover:bg-accent',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {feed.isPending ? (
        <SkeletonRows rows={4} className="px-0" />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={StickyNote}
          title={filter === 'all' ? 'Nothing has happened yet' : 'Nothing of this kind yet'}
          description={
            filter === 'all' ? 'Notes, moves, emails and interviews show up here.' : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <Fragment key={day.label}>
              <section aria-label={day.label}>
                <h3 className="mb-3 text-xs font-medium tracking-[0.04em] text-fg-subtle uppercase">
                  {day.label}
                </h3>
                <ul>{day.items.map(row)}</ul>
              </section>
            </Fragment>
          ))}
          {feed.hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              loading={feed.isFetchingNextPage}
              onClick={() => feed.fetchNextPage()}
            >
              Show older activity
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
