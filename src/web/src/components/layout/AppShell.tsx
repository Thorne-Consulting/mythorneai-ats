'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  Bell,
  Briefcase,
  ChevronDown,
  CircleHelp,
  Keyboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { api, resetCsrfToken } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
} from '@/components/ui';
import { OrganizationSetupModal } from '@/features/admin/OrganizationSetupModal';
import { WelcomeDialog } from '@/features/admin/WelcomeDialog';
import { START_PAGES } from '@/features/admin/preferences';
import { useAbility } from '@/lib/ability';
import { MessagesNavBadge } from '@/features/messages/MessagesNavBadge';
import { LAST_APP_PATH, SettingsRail } from '@/features/admin/SettingsShell';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { cn } from '@/lib/cn';
import { useCollapsePref } from '@/lib/collapse-pref';
import { useHotkeys } from '@/lib/hooks';
import { Brand } from './Brand';
import { CommandSearch, SearchTrigger, openShortcuts, useSearchHotkeys } from './CommandSearch';
import { isActive, primaryNav, supportNav, type NavItem } from './nav';
import { SectionNavPresence } from './SectionLayout';

/** Cookie for the sidebar beside pages that have their own section nav. Collapsed unless set to 0. */
export const SECTION_NAV_COOKIE = 'ats-nav-collapsed-section';

/**
 * The application frame from the Figma: navy header (brand, search, notifications, Post a Job,
 * account) over a navy sidebar, with the page on a pale panel rounded at the top-left.
 *
 * The sidebar has two remembered widths: one for ordinary pages and one for pages with their own
 * section nav (a job record, Reports), where it starts as an icon rail. CSS picks between them
 * with `:has([data-section-nav])`, so even a full page load paints the right width. On /settings
 * the settings rail takes its place.
 */
export function AppShell({
  children,
  navCollapsed,
  sectionNavCollapsed,
}: {
  children: React.ReactNode;
  navCollapsed: boolean;
  sectionNavCollapsed: boolean;
}) {
  const user = useCurrentUser();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsePref('ats-nav-collapsed', navCollapsed);
  const [sectionCollapsed, toggleSectionCollapsed] = useCollapsePref(
    SECTION_NAV_COOKIE,
    sectionNavCollapsed,
  );
  const [sectionNavs, setSectionNavs] = useState(0);
  const announce = useCallback((delta: 1 | -1) => setSectionNavs((n) => n + delta), []);
  const hasSectionNav = sectionNavs > 0;
  const railCollapsed = hasSectionNav ? sectionCollapsed : collapsed;
  const toggle = hasSectionNav ? toggleSectionCollapsed : toggleCollapsed;
  const settings = pathname.startsWith('/settings') && !pathname.startsWith('/settings/workflows/');
  useSearchHotkeys(() => setSearchOpen(true));
  useHotkeys([['mod+\\', toggle]]);
  useEffect(() => setMobileOpen(false), [pathname]);
  // "Back to MyThorneAI" in the settings rail returns here.
  useEffect(() => {
    if (pathname.startsWith('/settings')) return;
    const query = searchParams?.toString();
    try {
      sessionStorage.setItem(LAST_APP_PATH, query ? `${pathname}?${query}` : pathname);
    } catch {}
  }, [pathname, searchParams]);
  const router = useRouter();
  const ability = useAbility();
  // Start page (Settings → Preferences): applied once per browser session when landing on "/",
  // and only if this person may still open it.
  const startPage = user.preferences?.startPage;
  useEffect(() => {
    try {
      if (pathname !== '/' || sessionStorage.getItem('ats-started')) return;
      sessionStorage.setItem('ats-started', '1');
      const page = START_PAGES.find((p) => p.value === startPage);
      if (page && page.value !== '/' && page.allowed(ability)) router.replace(page.value);
    } catch {}
  }, [pathname, router, startPage, ability]);

  return (
    <SectionNavPresence.Provider value={announce}>
      <div
        data-main-nav={collapsed ? 'collapsed' : 'open'}
        data-section-nav-pref={sectionCollapsed ? 'collapsed' : 'open'}
        className="min-h-dvh bg-chrome print:bg-card"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-fg"
        >
          Skip to content
        </a>
        <Header onSearch={() => setSearchOpen(true)} onMenu={() => setMobileOpen(true)} />
        <div className="flex">
          {settings ? (
            <aside className="sticky top-[77px] hidden h-[calc(100dvh-77px)] w-[264px] shrink-0 bg-chrome md:block print:!hidden">
              <SettingsRail />
            </aside>
          ) : (
            <aside
              className={cn(
                '@container/rail sticky top-[77px] hidden h-[calc(100dvh-77px)] w-[234px] shrink-0 flex-col bg-chrome transition-[width] duration-200 md:flex print:!hidden',
                // Ordinary pages follow the main choice; pages with a section nav follow their own.
                '[[data-main-nav=collapsed]:not(:has([data-section-nav]))_&]:w-[84px]',
                '[[data-section-nav-pref=collapsed]:has([data-section-nav])_&]:w-[84px]',
              )}
            >
              <Sidebar collapsed={railCollapsed} onToggle={toggle} />
            </aside>
          )}
          <MobileDrawer open={mobileOpen} onOpenChange={setMobileOpen} settings={settings} />
          <main
            id="main"
            className="min-h-[calc(100dvh-77px)] min-w-0 flex-1 bg-background md:rounded-tl-2xl max-md:min-h-[calc(100dvh-64px)] print:rounded-none print:bg-card"
          >
            <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>
        <CommandSearch opened={searchOpen} onClose={() => setSearchOpen(false)} />
        <OrganizationSetupModal
          opened={user.isOrganizationOwner && !user.organizationSetupCompleted}
        />
        {user.preferences?.welcome && !user.isOrganizationOwner && <WelcomeDialog />}
      </div>
    </SectionNavPresence.Provider>
  );
}

function Header({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const ability = useAbility();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center print:hidden gap-3 bg-chrome px-3 md:h-[77px] md:gap-6 md:px-[22px] lg:gap-10">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="rounded-md p-2 text-white hover:bg-nav-hover md:hidden"
      >
        <MenuIcon className="size-5" />
      </button>
      <Brand className="max-sm:hidden" />
      <Brand compact className="sm:hidden" />
      <div className="hidden min-w-0 max-w-[739px] flex-1 md:block">
        <SearchTrigger onOpen={onSearch} />
      </div>
      <div className="ml-auto flex items-center gap-2 md:gap-5 lg:gap-8">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="rounded-md p-2 text-white hover:bg-nav-hover md:hidden"
        >
          <Search className="size-5" />
        </button>
        <NotificationBell />
        {ability.can('create', 'Job') && (
          <Button
            variant="brand"
            size="lg"
            leftIcon={<Briefcase />}
            onClick={() => router.push('/jobs/new')}
            className="h-11 rounded-lg bg-gradient-to-b from-brand to-brand-deep font-bold shadow-brand hover:from-brand-hover max-lg:hidden"
          >
            Post a Job
          </Button>
        )}
        <span aria-hidden className="hidden h-10 w-px bg-white/10 lg:block" />
        <AccountMenu />
      </div>
    </header>
  );
}

function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    try {
      await api.post<void>('/api/auth/logout');
    } finally {
      resetCsrfToken();
      queryClient.clear();
      // Lands on the sign-in page, which does not sign anyone in by itself after a sign-out.
      window.location.assign('/login?signedOut=1');
    }
  };
}

function AccountMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const signOut = useSignOut();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 rounded-lg p-1 text-left hover:bg-nav-hover"
          aria-label="Account"
        >
          <Avatar name={user.displayName} tone={user.avatarTone ?? 'solid'} size="lg" />
          <span className="hidden min-w-0 lg:block">
            <span className="block max-w-36 truncate text-base font-medium text-white">
              {user.displayName}
            </span>
            <span className="mt-1 block text-xs text-nav-foreground">{user.roleName}</span>
          </span>
          <ChevronDown className="hidden size-4 text-white lg:block" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem icon={<UserRound />} onSelect={() => router.push('/settings/profile')}>
          Profile
        </MenuItem>
        <MenuItem
          icon={<SlidersHorizontal />}
          onSelect={() => router.push('/settings/preferences')}
        >
          Preferences
        </MenuItem>
        <MenuItem icon={<Bell />} onSelect={() => router.push('/settings/notifications')}>
          Notification settings
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Keyboard />} onSelect={openShortcuts}>
          Keyboard shortcuts
        </MenuItem>
        <MenuItem icon={<CircleHelp />} onSelect={() => router.push('/help')}>
          Help
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} danger onSelect={signOut}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Below md: the navigation in a Radix dialog (focus trap, Esc, scroll lock), with Post a Job and the account. */
function MobileDrawer({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: boolean;
}) {
  const user = useCurrentUser();
  const ability = useAbility();
  const router = useRouter();
  const signOut = useSignOut();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-chrome/60 md:hidden data-[state=open]:animate-[overlay-in_160ms_ease-out]" />
        <DialogPrimitive.Content className="@container/rail fixed inset-y-0 left-0 z-50 flex w-[min(300px,calc(100vw-3rem))] flex-col bg-chrome shadow-pop outline-none md:hidden data-[state=open]:animate-in">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Pages of MyThorneAI and your account
          </DialogPrimitive.Description>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <Brand compact />
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="rounded-md p-2 text-white hover:bg-nav-hover"
            >
              <PanelLeftClose className="size-5" />
            </DialogPrimitive.Close>
          </div>
          {ability.can('create', 'Job') && !settings && (
            <div className="px-[15px] pt-4">
              <Button
                variant="brand"
                fullWidth
                leftIcon={<Briefcase />}
                onClick={() => {
                  onOpenChange(false);
                  router.push('/jobs/new');
                }}
                className="h-11 rounded-lg bg-gradient-to-b from-brand to-brand-deep font-bold"
              >
                Post a Job
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {settings ? <SettingsRail /> : <Sidebar collapsed={false} />}
          </div>
          <div className="flex items-center gap-3 border-t border-nav-divider px-4 py-3">
            <Avatar name={user.displayName} tone={user.avatarTone ?? 'solid'} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {user.displayName}
              </span>
              <span className="block text-xs text-nav-foreground">{user.roleName}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-nav-foreground hover:bg-nav-hover hover:text-white"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Labels and spacing follow the rail's own width (a container query), so the server-rendered
// width and the content always agree.
const showWide = 'hidden @[160px]/rail:inline';

/** Scorecards this person still owes; shown on Interviews. Same query as the My feedback page. */
function useScorecardsDue() {
  const due = useQuery({
    queryKey: ['my-scorecards', 'due'],
    queryFn: () => api.get<{ counts?: { due: number } }>('/api/me/scorecards?status=due'),
    refetchInterval: 60_000,
  });
  return due.data?.counts?.due ?? 0;
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const ability = useAbility();
  const pathname = usePathname() ?? '/';
  const scorecardsDue = useScorecardsDue();
  return (
    <nav
      aria-label="Main"
      className="flex h-full flex-col overflow-y-auto px-[15px] pt-[23px] pb-4 scrollbar-hide"
    >
      <ul className="space-y-[3px]">
        {primaryNav(ability).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            collapsed={collapsed}
            count={item.href === '/interviews' ? scorecardsDue : 0}
            countLabel="scorecards to write"
          />
        ))}
      </ul>
      <div className="px-[9px] pt-[22px] pb-[14px]">
        <div className="h-px bg-nav-divider" />
      </div>
      <ul className="space-y-[3px]">
        {supportNav(ability).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            collapsed={collapsed}
          />
        ))}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-2 pt-6 @[160px]/rail:items-start">
        {/* Thorney is brand art; clicking it opens Help. */}
        <Tooltip label="Help" side="right" disabled={!collapsed}>
          <Link
            href="/help"
            aria-label="Open help"
            className="group shrink-0 rounded-lg p-1 hover:bg-nav-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/thorney.png"
              alt=""
              className="h-8 w-auto transition-transform group-hover:-translate-y-0.5 @[160px]/rail:h-[72px]"
            />
          </Link>
        </Tooltip>
        {onToggle && (
          <Tooltip label={`${collapsed ? 'Expand' : 'Collapse'} sidebar (⌘\\)`} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className="flex h-10 items-center gap-3 rounded-lg px-[12px] text-sm text-nav-foreground hover:bg-nav-hover hover:text-white"
            >
              <PanelLeftOpen className="size-5 @[160px]/rail:hidden" aria-hidden />
              <PanelLeftClose className="hidden size-5 @[160px]/rail:block" aria-hidden />
              <span className={showWide}>Collapse</span>
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  count = 0,
  countLabel,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
  countLabel?: string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Tooltip
        label={item.preview ? `${item.label} (preview)` : item.label}
        side="right"
        disabled={!collapsed}
      >
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cn(
            'flex h-[49px] items-center justify-center rounded-lg text-md text-nav-foreground transition-colors hover:bg-nav-hover hover:text-white @[160px]/rail:justify-start @[160px]/rail:gap-[22px] @[160px]/rail:px-[18px]',
            active &&
              'bg-gradient-to-r from-nav-active-from to-nav-active-to font-semibold text-white hover:bg-transparent',
          )}
        >
          <span className="relative shrink-0">
            <Icon className="size-6" strokeWidth={1.75} aria-hidden />
            {/* On the icon rail the count becomes a dot. */}
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand ring-2 ring-chrome @[160px]/rail:hidden" />
            )}
          </span>
          <span className="hidden min-w-0 flex-1 @[160px]/rail:block">
            <span className="block truncate">{item.label}</span>
            {/* Sample-data screens say so, under the label so it never gets cut. */}
            {item.preview && (
              <span className="-mt-0.5 block text-2xs font-medium text-tone-amber-dot">
                Preview
              </span>
            )}
          </span>
          {item.href === '/messages' && <MessagesNavBadge className="hidden @[160px]/rail:flex" />}
          {count > 0 && (
            <span
              className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-bold text-brand-foreground tnum @[160px]/rail:flex"
              aria-label={`${count} ${countLabel ?? ''}`.trim()}
            >
              {count}
            </span>
          )}
        </Link>
      </Tooltip>
    </li>
  );
}
