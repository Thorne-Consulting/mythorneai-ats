'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  Bell,
  Briefcase,
  CalendarPlus,
  Keyboard,
  LineChart,
  Moon,
  Plus,
  Search,
  Settings,
  User,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Kbd, Modal } from '@/components/ui';
import { CreateCandidateModal } from '@/features/candidates/CreateCandidateModal';
import { fuzzyScore } from '@/features/dashboard/fuzzy-match';
import { REPORT_GROUPS } from '@/features/reports/report-data';
import { useDebouncedValue, useHotkeys } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { setTheme } from '@/lib/theme';
import { canPostJobs, primaryNav, supportNav } from './nav';

type SearchResult = {
  requisitions: Array<{ id: string; code: string; title: string }>;
  candidates: Array<{ id: string; name: string; email: string }>;
};
type Item = {
  key: string;
  group: 'Actions' | 'Go to' | 'Candidates' | 'Jobs';
  title: string;
  meta?: string;
  icon: LucideIcon;
  /** Extra words to match on. */
  keywords?: string;
  href?: string;
  run?: () => void;
};

/** Every keyboard shortcut in the app; Help shows the same list. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['/'], action: 'Search, or run an action' },
  { keys: ['⌘', 'K'], action: 'Open search from anywhere' },
  { keys: ['⌘', '\\'], action: 'Collapse or expand the sidebar' },
  { keys: ['?'], action: 'Show keyboard shortcuts' },
  { keys: ['↑', '↓'], action: 'Move through search results' },
  { keys: ['Enter'], action: 'Open the selected result' },
  { keys: ['Esc'], action: 'Close a dialog or panel' },
];

export function ShortcutList({ className }: { className?: string }) {
  return (
    <dl className={cn('divide-y divide-border-subtle', className)}>
      {SHORTCUTS.map((s) => (
        <div key={s.action} className="flex items-center justify-between gap-3 py-3">
          <dt className="text-sm text-fg-muted">{s.action}</dt>
          <dd className="flex shrink-0 gap-1">
            {s.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Workspace settings sections (admins), mirroring the settings sidebar.
const SETTINGS: [string, string][] = [
  ['/admin', 'Members'],
  ['/admin/roles', 'Roles and permissions'],
  ['/admin/invitations', 'Invitations'],
  ['/admin/approvals', 'Approvals'],
  ['/admin/reminders', 'Reminders'],
  ['/admin/notifications', 'Team notifications'],
  ['/admin/portal', 'Candidate portal'],
  ['/admin/email', 'Candidate email'],
  ['/admin/pipelines', 'Pipelines'],
  ['/admin/fields', 'Candidate fields'],
  ['/admin/templates', 'Posting templates'],
  ['/admin/email-templates', 'Email templates'],
  ['/admin/integrations', 'Calendar'],
  ['/admin/webhooks', 'Webhooks'],
  ['/admin/ai-settings', 'AI assistance'],
  ['/admin/audit', 'Activity history'],
  ['/admin/sso', 'Single sign-on'],
  ['/admin/workflows', 'Automated workflows'],
];

/** Header search field (Figma: 44px, pale pill on navy). Opens the palette. */
export function SearchTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search candidates and jobs"
      className={cn(
        'flex h-11 w-full items-center gap-3.5 rounded-[17px] bg-chrome-search px-4 text-left text-base text-chrome-search-foreground transition-shadow hover:ring-2 hover:ring-white/20',
        className,
      )}
    >
      <Search className="size-5 shrink-0" aria-hidden />
      <span className="flex-1 truncate">Search candidates and jobs…</span>
      <Kbd className="max-lg:hidden">/</Kbd>
    </button>
  );
}

/** The palette: search people and jobs, or run an action. Also owns the global "?" shortcut sheet. */
export function CommandSearch({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [addCandidate, setAddCandidate] = useState(false);
  const debounced = useDebouncedValue(query, 200);
  useHotkeys([
    ['?', () => setShortcutsOpen(true)],
    ['shift+?', () => setShortcutsOpen(true)],
  ]);
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResult>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });

  const actions = useMemo<Item[]>(() => {
    const staff = ['Admin', 'Recruiter'].includes(user.role);
    const list: Item[] = [];
    if (canPostJobs(user))
      list.push({
        key: 'new-job',
        group: 'Actions',
        title: 'Create job',
        keywords: 'post new requisition',
        icon: Plus,
        href: '/jobs/new',
      });
    if (staff)
      list.push({
        key: 'new-candidate',
        group: 'Actions',
        title: 'Add candidate',
        keywords: 'new person applicant',
        icon: UserPlus,
        run: () => setAddCandidate(true),
      });
    if (user.role !== 'Interviewer')
      list.push({
        key: 'schedule',
        group: 'Actions',
        title: 'Schedule interview',
        keywords: 'calendar book',
        icon: CalendarPlus,
        href: '/interviews',
      });
    list.push(
      {
        key: 'theme',
        group: 'Actions',
        title: 'Turn dark mode on or off',
        keywords: 'theme light dark appearance',
        icon: Moon,
        run: () => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'),
      },
      {
        key: 'shortcuts',
        group: 'Actions',
        title: 'Show keyboard shortcuts',
        keywords: 'keys help hotkeys',
        icon: Keyboard,
        run: () => setShortcutsOpen(true),
      },
    );
    for (const item of [...primaryNav(user), ...supportNav(user)])
      list.push({
        key: `go-${item.href}`,
        group: 'Go to',
        title: item.label,
        keywords: 'open page',
        icon: item.icon,
        href: item.href,
      });
    list.push({
      key: 'go-notifications',
      group: 'Go to',
      title: 'Notifications',
      keywords: 'waiting inbox todo',
      icon: Bell,
      href: '/notifications',
    });
    if (user.permissions.includes('reports'))
      for (const report of [
        ...REPORT_GROUPS.flatMap((g) => g.reports),
        { key: 'builder', title: 'Report builder' },
      ])
        list.push({
          key: `go-report-${report.key}`,
          group: 'Go to',
          title: report.title,
          meta: 'Report',
          keywords: 'report',
          icon: LineChart,
          href: `/reports/${report.key}`,
        });
    if (user.role === 'Admin')
      for (const [href, label] of SETTINGS)
        list.push({
          key: `go-${href}`,
          group: 'Go to',
          title: label,
          meta: 'Settings',
          keywords: `settings admin ${href}`, // ponytail: the path keeps old names (audit, sso) findable
          icon: Settings,
          href,
        });
    else
      list.push({
        key: 'go-my-settings',
        group: 'Go to',
        title: 'My settings',
        keywords: 'profile account',
        icon: Settings,
        href: '/settings/profile',
      });
    return list;
  }, [user]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const matched = q
      ? actions
          .map((item) => ({
            item,
            // The title counts most; keywords and meta only help an item qualify.
            score: Math.max(
              fuzzyScore(q, item.title) * 2,
              fuzzyScore(q, `${item.title} ${item.meta ?? ''} ${item.keywords ?? ''}`),
            ),
          }))
          .filter((m) => m.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((m) => m.item)
      : actions.filter((item) => item.group === 'Actions');
    const searching = debounced.trim().length >= 2;
    return [
      ...matched,
      ...(searching ? (results.data?.candidates ?? []) : []).map((c) => ({
        key: `c-${c.id}`,
        group: 'Candidates' as const,
        href: `/candidates/${c.id}`,
        title: c.name,
        meta: c.email,
        icon: User,
      })),
      ...(searching ? (results.data?.requisitions ?? []) : []).map((r) => ({
        key: `j-${r.id}`,
        group: 'Jobs' as const,
        href: `/jobs/${r.id}`,
        title: r.title,
        meta: `Job · ${r.code}`,
        icon: Briefcase,
      })),
    ];
  }, [actions, query, debounced, results.data]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!opened) setQuery('');
  }, [opened]);
  const choose = (item: Item) => {
    onClose();
    if (item.href) router.push(item.href);
    item.run?.();
  };
  const searching = debounced.trim().length >= 2;

  return (
    <>
      <DialogPrimitive.Root open={opened} onOpenChange={(o) => !o && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-chrome/45 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            aria-label="Search"
            className="fixed top-[12vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover shadow-pop outline-none animate-in"
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Find candidates and jobs, or run an action
            </DialogPrimitive.Description>
            <div className="flex items-center gap-3 border-b border-border-subtle px-4">
              <Search className="size-5 text-fg-subtle" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Find a candidate or a job, or type a command…"
                aria-label="Search candidates and jobs, or run an action"
                role="combobox"
                aria-expanded
                aria-controls="command-results"
                aria-activedescendant={items[active] ? `cmd-${items[active].key}` : undefined}
                className="h-14 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, items.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && items[active]) {
                    e.preventDefault();
                    choose(items[active]);
                  }
                }}
              />
            </div>
            <div
              id="command-results"
              role="listbox"
              aria-label="Results"
              className="max-h-[50vh] overflow-y-auto p-2"
            >
              {items.map((item, i) => (
                <div key={item.key} role="presentation">
                  {item.group !== items[i - 1]?.group && (
                    <p
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase"
                    >
                      {item.group}
                    </p>
                  )}
                  <button
                    id={`cmd-${item.key}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                      i === active && 'bg-accent',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-fg-muted">
                      <item.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-fg">
                        {item.title}
                      </span>
                      {item.meta && (
                        <span className="block truncate text-xs text-fg-subtle">{item.meta}</span>
                      )}
                    </span>
                  </button>
                </div>
              ))}
              {!searching && query.trim().length < 2 && (
                <p className="px-3 py-2 text-sm text-fg-subtle">
                  Type a name, an email or a job title to search.
                </p>
              )}
              {searching && results.isFetching && !results.data && (
                <p className="px-3 py-2 text-sm text-fg-subtle">Searching…</p>
              )}
              {searching && results.data && items.length === 0 && (
                <p className="px-3 py-2 text-sm text-fg-subtle">
                  Nothing matches “{debounced.trim()}”.
                </p>
              )}
            </div>
            <div className="border-t border-border-subtle px-4 py-2.5 text-xs text-fg-subtle">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move · <Kbd>Enter</Kbd> to open · <Kbd>Esc</Kbd> to close
              · <Kbd>?</Kbd> shortcuts
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Modal
        opened={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard shortcuts"
        description="Use Ctrl instead of ⌘ on Windows and Linux."
        size="sm"
      >
        <ShortcutList className="-my-3" />
      </Modal>
      <CreateCandidateModal opened={addCandidate} onClose={() => setAddCandidate(false)} />
    </>
  );
}

/** "/" and ⌘K / Ctrl+K open search from anywhere that isn't a text field. */
export function useSearchHotkeys(open: () => void) {
  useHotkeys([
    ['/', open],
    ['mod+k', open],
  ]);
}
