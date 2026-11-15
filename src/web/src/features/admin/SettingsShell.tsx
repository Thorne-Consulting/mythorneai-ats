'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, ShieldAlert, X } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Badge, Card, EmptyState, LinkTabs, PageHeader, type Crumb } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAbility } from '@/lib/ability';
import { findSettingsPage, searchSettings, settingsGroups } from './settings-registry';

/** Where "Back to MyThorneAI" goes: the last page outside settings, kept by the app shell. */
export const LAST_APP_PATH = 'ats-last-app-path';

export interface PendingAccessRequest {
  id: string;
  email: string;
  name: string;
  note?: string | null;
  createdAt: string;
}

export function useAccessRequests() {
  const ability = useAbility();
  return useQuery({
    queryKey: ['admin', 'access-requests'],
    queryFn: () => api.get<PendingAccessRequest[]>('/api/admin/access-requests'),
    enabled: ability.can('manage', 'Member'),
  });
}

/**
 * The settings rail. It takes the place of the app sidebar on every /settings page, like Linear
 * and Notion: a way back, a search field, then the grouped pages from the registry.
 */
export function SettingsRail({ className }: { className?: string }) {
  const user = useCurrentUser();
  const ability = useAbility();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [query, setQuery] = useState('');
  const groups = searchSettings(settingsGroups(ability), query);
  const active = findSettingsPage(pathname)?.page.href;
  const requests = useAccessRequests().data?.length ?? 0;
  const back = () => {
    let to = '/';
    try {
      to = sessionStorage.getItem(LAST_APP_PATH) ?? '/';
    } catch {}
    router.push(to.startsWith('/') && !to.startsWith('//') ? to : '/');
  };

  return (
    <nav aria-label="Settings" className={cn('flex h-full flex-col', className)}>
      <div className="space-y-3 px-[15px] pt-[19px] pb-3">
        <button
          type="button"
          onClick={back}
          className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-nav-foreground transition-colors hover:bg-nav-hover hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to MyThorneAI
        </button>
        <div className="px-3">
          <p className="text-lg font-semibold text-white">Settings</p>
          {user.organizationName && (
            <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-nav-foreground">
              {user.workspaceIconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.workspaceIconUrl}
                  alt=""
                  className="size-5 shrink-0 rounded-md bg-white object-contain"
                />
              )}
              <span className="truncate">{user.organizationName}</span>
            </p>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">Search settings</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-nav-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              const first = groups[0]?.pages[0];
              if (event.key === 'Enter' && first) router.push(first.href);
              if (event.key === 'Escape') setQuery('');
            }}
            placeholder="Search settings"
            className="h-9 w-full rounded-lg bg-white/10 pr-8 pl-9 text-sm text-white outline-none placeholder:text-nav-foreground focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-nav-foreground hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-[15px] pt-2 pb-6">
        {groups.length === 0 && (
          <p className="px-3 text-sm text-nav-foreground">No settings match “{query.trim()}”.</p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-2xs font-semibold tracking-[0.06em] text-nav-foreground/80 uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.pages.map((page) => {
                const on = page.href === active;
                const Icon = page.icon;
                const count = page.href === '/settings/members' ? requests : 0;
                return (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-nav-foreground transition-colors hover:bg-nav-hover hover:text-white',
                        on &&
                          'bg-gradient-to-r from-nav-active-from to-nav-active-to font-medium text-white',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{page.label}</span>
                      {page.preview && <PreviewTag />}
                      {count > 0 && (
                        <span
                          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-bold text-brand-foreground tnum"
                          aria-label={`${count} access ${count === 1 ? 'request' : 'requests'} waiting`}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** The small amber "Preview" mark for sample-data screens in the navy rails. */
export function PreviewTag() {
  return (
    <span className="rounded-full bg-tone-amber-bg px-1.5 py-px text-2xs font-medium text-tone-amber-fg">
      Preview
    </span>
  );
}

/** /settings/* content: gates workspace pages to admins and sets the reading width. */
export function SettingsShell({ children }: { children: ReactNode }) {
  const ability = useAbility();
  const pathname = usePathname() ?? '';
  const hit = findSettingsPage(pathname);
  if (hit?.group.admin && !ability.can('manage', 'Workspace'))
    return (
      <Card className="mx-auto mt-8 max-w-lg">
        <EmptyState
          icon={ShieldAlert}
          title="Only admins can open workspace settings"
          description="Ask an admin if you need something changed here."
        />
      </Card>
    );
  // The workflow editor owns the whole width and its own header.
  if (pathname.startsWith('/settings/workflows/')) return <>{children}</>;
  return <div className="mx-auto w-full max-w-[1040px] min-w-0 space-y-5">{children}</div>;
}

/**
 * The header of a settings page, from the registry: title, Preview badge, pills for sibling pages,
 * and breadcrumbs on child pages only (the rail already says where you are). Pages put their
 * buttons in `actions`.
 */
export function SettingsHeader({
  title,
  description,
  actions,
  crumbs,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra trail for a child page, for example the role name. */
  crumbs?: Crumb[];
  children?: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const page = findSettingsPage(pathname)?.page;
  const child = page && pathname !== page.href && !page.tabs?.some((t) => t.href === pathname);
  const text = title ?? page?.title ?? page?.label;
  return (
    <PageHeader
      breadcrumbs={
        child && page
          ? [{ label: page.title ?? page.label, href: page.href }, ...(crumbs ?? [])]
          : undefined
      }
      title={
        page?.preview ? (
          <span className="inline-flex flex-wrap items-center gap-3">
            {text}
            <Badge tone="amber">Preview</Badge>
          </span>
        ) : (
          text
        )
      }
      description={description ?? (child ? undefined : page?.description)}
      actions={actions}
    >
      {page?.tabs && !child && (
        <LinkTabs
          variant="pills"
          aria-label={page.label}
          items={page.tabs.map((tab) => ({ href: tab.href, exact: true, label: tab.label }))}
        />
      )}
      {children}
    </PageHeader>
  );
}

/** A route file's header plus the page body, for settings pages owned by other areas. */
export function SettingsPageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsHeader />
      {children}
    </>
  );
}
