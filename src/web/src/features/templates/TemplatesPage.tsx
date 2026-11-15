'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, FileSignature, FileText, Mail, Plus, Users } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  MenuItem,
  PageHeader,
  RowActions,
  SearchInput,
  SkeletonRows,
  Tabs,
  toast,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';
import {
  useRefreshTemplates,
  useTemplateLibrary,
  type AutomaticEmail,
  type SavedReply,
} from './templates-data';

type Tab = 'saved' | 'automatic';

/**
 * The one template library: saved replies people drop into conversations, and the automatic
 * emails the app sends, each with where it is sent from.
 */
export function TemplatesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'automatic' ? 'automatic' : 'saved';
  const library = useTemplateLibrary();
  const data = library.data;
  const setTab = (next: string) =>
    router.replace(
      next === 'automatic' ? '/messages/templates?tab=automatic' : '/messages/templates',
      {
        scroll: false,
      },
    );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Messages', href: '/messages' }, { label: 'Templates' }]}
        title="Templates"
        actions={
          tab === 'saved' && (
            <Button leftIcon={<Plus />} onClick={() => router.push('/messages/templates/new')}>
              New saved reply
            </Button>
          )
        }
      />
      <Card>
        <Tabs
          value={tab}
          onValueChange={setTab}
          aria-label="Kinds of template"
          className="px-5 pt-2"
          items={[
            { value: 'saved', label: 'Saved replies', count: data?.saved.length },
            { value: 'automatic', label: 'Automatic emails', count: data?.automatic.length },
          ]}
        />
        {!data ? (
          <SkeletonRows rows={6} className="p-5" />
        ) : tab === 'saved' ? (
          <SavedList replies={data.saved} />
        ) : (
          <AutomaticList emails={data.automatic} />
        )}
      </Card>
    </>
  );
}

function SavedList({ replies }: { replies: SavedReply[] }) {
  const router = useRouter();
  const refresh = useRefreshTemplates();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedReply | null>(null);
  const categories = [...new Set(replies.map((r) => r.category).filter(Boolean))] as string[];
  const q = search.trim().toLowerCase();
  const rows = replies.filter(
    (r) =>
      (!category || r.category === category) &&
      (!q || `${r.name} ${r.body}`.toLowerCase().includes(q)),
  );

  const duplicate = (reply: SavedReply) =>
    api
      .post<{ id: string }>('/api/templates', {
        name: `${reply.name} (copy)`,
        category: reply.category,
        subject: reply.subject,
        body: reply.body,
        shared: false,
      })
      .then((created) => {
        refresh();
        toast.success('Saved reply copied', 'The copy is only yours until you share it.');
        router.push(`/messages/templates/${created.id}`);
      })
      .catch((error: Error) => toast.error('Could not copy the saved reply', error.message));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-y border-border-subtle px-5 py-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search saved replies"
          className="w-full sm:w-72"
        />
        {categories.length > 1 && (
          <FilterSelect
            value={category}
            onChange={setCategory}
            data={categories}
            allLabel="All categories"
          />
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={FileText}
          title={q || category ? 'No saved replies match' : 'No saved replies yet'}
          description={
            q || category
              ? 'Try another word or category.'
              : 'Save answers you give often. Press # in a conversation to use one.'
          }
          action={
            !q &&
            !category && (
              <Button
                size="sm"
                leftIcon={<Plus />}
                onClick={() => router.push('/messages/templates/new')}
              >
                New saved reply
              </Button>
            )
          }
          className="py-12"
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((reply) => (
            <li key={reply.id} className="group flex items-center gap-2 pr-3 hover:bg-muted/60">
              <Link
                href={`/messages/templates/${reply.id}`}
                className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-base font-medium text-fg">{reply.name}</span>
                  {reply.category && <Badge>{reply.category}</Badge>}
                  <Badge tone={reply.shared ? 'blue' : 'gray'}>
                    {reply.shared ? 'Shared with the team' : 'Only you'}
                  </Badge>
                </span>
                <span className="line-clamp-1 text-sm text-fg-subtle">{plain(reply.body)}</span>
              </Link>
              <span className="hidden shrink-0 text-xs text-fg-subtle sm:block">
                Edited {formatRelative(reply.updatedAt)}
              </span>
              <RowActions label={`Actions for ${reply.name}`}>
                <MenuItem onSelect={() => router.push(`/messages/templates/${reply.id}`)}>
                  {reply.canEdit ? 'Edit' : 'Open'}
                </MenuItem>
                <MenuItem onSelect={() => duplicate(reply)}>Make a copy</MenuItem>
                {reply.canEdit && (
                  <MenuItem danger onSelect={() => setDeleting(reply)}>
                    Delete
                  </MenuItem>
                )}
              </RowActions>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this saved reply?"
        message={
          deleting &&
          (deleting.shared
            ? `“${deleting.name}” is removed for everyone on your team. Messages already sent stay as they are.`
            : `“${deleting.name}” is removed. Messages already sent stay as they are.`)
        }
        confirmLabel="Delete saved reply"
        onConfirm={async () => {
          await api
            .delete(`/api/templates/${deleting!.id}`)
            .then(() => {
              refresh();
              toast.success('Saved reply deleted', deleting!.name);
            })
            .catch((error: Error) =>
              toast.error('Could not delete the saved reply', error.message),
            );
        }}
      />
    </>
  );
}

function AutomaticList({ emails }: { emails: AutomaticEmail[] }) {
  const groups: { label: string; icon: typeof Mail; items: AutomaticEmail[] }[] = [
    { label: 'To candidates', icon: Mail, items: emails.filter((e) => e.audience === 'Candidate') },
    { label: 'To your team', icon: Users, items: emails.filter((e) => e.audience === 'Team') },
  ];
  return (
    <div className="border-t border-border-subtle">
      {groups.map(({ label, icon: Icon, items }) => (
        <section key={label} aria-label={label}>
          <h2 className="flex items-center gap-2 bg-muted px-5 py-2 text-xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            <Icon className="size-3.5" aria-hidden />
            {label}
          </h2>
          <ul className="divide-y divide-border-subtle">
            {items.map((email) => (
              <li key={email.key}>
                <Link
                  href={`/messages/templates/${email.key}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium text-fg">{email.label}</span>
                      {email.changed && <Badge tone="blue">Changed</Badge>}
                      {email.overrides > 0 && (
                        <Badge tone="violet">
                          {email.overrides === 1
                            ? 'Own wording on 1 job'
                            : `Own wording on ${email.overrides} jobs`}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-fg-subtle">{email.sentWhen}</span>
                  </span>
                  {email.updatedAt && (
                    <span className="hidden shrink-0 text-right text-xs text-fg-subtle md:block">
                      Edited {formatRelative(email.updatedAt)}
                      {email.updatedByName && (
                        <span className="block">by {email.updatedByName}</span>
                      )}
                    </span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Offer letters" className="border-t border-border-subtle">
        <Link
          href="/settings/offer-letters"
          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <FileSignature className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium text-fg">Offer letters</span>
            <span className="mt-0.5 block text-sm text-fg-subtle">
              The letter each offer starts from, with the same details as these emails. Kept in
              Settings.
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        </Link>
      </section>
    </div>
  );
}

/** Markdown to one readable line: chips as their key, links and marks dropped. */
const plain = (markdown: string) =>
  markdown
    .replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (_, key: string) => `[${key.replace(/([A-Z])/g, ' $1').toLowerCase()}]`,
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
