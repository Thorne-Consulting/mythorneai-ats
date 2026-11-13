'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Briefcase,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  UserRound,
  X,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import { OrganizationSetupModal } from '@/features/admin/OrganizationSetupModal';
import { cn } from '@/lib/cn';
import { useCollapsePref } from '@/lib/collapse-pref';
import { humanize } from '@/lib/format';
import { useHotkeys } from '@/lib/hooks';
import { setTheme, useTheme, type ThemePref } from '@/lib/theme';
import { formatRelative } from '@/lib/format';
import { Brand } from './Brand';
import { CommandSearch, SearchTrigger, useSearchHotkeys } from './CommandSearch';
import { canPostJobs, isActive, primaryNav, supportNav, type NavItem } from './nav';

/**
 * The application frame from the Figma: navy header (brand, search, notifications, Post a Job,
 * account) over a navy sidebar, with the page on a pale panel rounded at the top-left.
 */
export function AppShell({
  children,
  navCollapsed,
}: {
  children: React.ReactNode;
  navCollapsed: boolean;
}) {
  const user = useCurrentUser();
  const pathname = usePathname() ?? '/';
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsePref('ats-nav-collapsed', navCollapsed);
  useSearchHotkeys(() => setSearchOpen(true));
  useHotkeys([['mod+\\', toggleCollapsed]]);
  useEffect(() => setMobileOpen(false), [pathname]);
  const router = useRouter();
  // Start page (My settings → Preferences): applied once per browser session when landing on "/".
  useEffect(() => {
    try {
      if (pathname !== '/' || sessionStorage.getItem('ats-started')) return;
      sessionStorage.setItem('ats-started', '1');
      const start = JSON.parse(localStorage.getItem('ats-pref:start-page') ?? 'null');
      if (
        typeof start === 'string' &&
        start.startsWith('/') &&
        !start.startsWith('//') &&
        start !== '/'
      )
        router.replace(start);
    } catch {}
  }, [pathname, router]);

  return (
    <div className="min-h-dvh bg-chrome print:bg-card">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-fg"
      >
        Skip to content
      </a>
      <Header
        onSearch={() => setSearchOpen(true)}
        onMenu={() => setMobileOpen((o) => !o)}
        mobileOpen={mobileOpen}
      />
      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            'sticky top-[77px] hidden h-[calc(100dvh-77px)] shrink-0 print:!hidden flex-col bg-chrome transition-[width] duration-200 md:flex',
            collapsed ? 'w-[84px]' : 'w-[234px]',
          )}
        >
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 top-[64px] z-40 md:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-chrome/60"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative flex h-full w-[264px] flex-col bg-chrome shadow-pop animate-in">
              <Sidebar collapsed={false} />
            </aside>
          </div>
        )}
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
    </div>
  );
}

function Header({
  onSearch,
  onMenu,
  mobileOpen,
}: {
  onSearch: () => void;
  onMenu: () => void;
  mobileOpen: boolean;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-chrome px-3 md:h-[77px] md:gap-6 md:px-[22px] lg:gap-10">
      <button
        type="button"
        onClick={onMenu}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        className="rounded-md p-2 text-white hover:bg-nav-hover md:hidden"
      >
        {mobileOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
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
        <Notifications />
        {canPostJobs(user) && (
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

function Notifications() {
  const approvals = usePendingApprovals().data ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            approvals.length ? `Notifications, ${approvals.length} waiting on you` : 'Notifications'
          }
          className="relative rounded-md p-1.5 text-white hover:bg-nav-hover"
        >
          <Bell className="size-6" strokeWidth={1.75} />
          {approvals.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-2xs font-bold text-brand-foreground tnum">
              {approvals.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <p className="text-base font-semibold text-fg">Waiting on you</p>
          <Link
            href="/notifications"
            className="text-sm font-medium text-accent-foreground hover:underline"
          >
            View all
          </Link>
        </div>
        {approvals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-subtle">You are all caught up.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {approvals.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link
                  href={
                    a.applicationId
                      ? `/applications/${a.applicationId}`
                      : a.requisitionId
                        ? `/jobs/${a.requisitionId}`
                        : '/approvals'
                  }
                  className="block px-4 py-2.5 hover:bg-muted"
                >
                  <p className="text-sm font-medium text-fg">
                    {a.type} approval · {a.title}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {a.requestedByName} · {formatRelative(a.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

const themeItems: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun /> },
  { value: 'dark', label: 'Dark', icon: <Moon /> },
  { value: 'system', label: 'System', icon: <Monitor /> },
];

function AccountMenu() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const logout = async () => {
    await api.post<void>('/api/auth/logout');
    resetCsrfToken();
    queryClient.clear();
    window.location.assign('/');
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 rounded-lg p-1 text-left hover:bg-nav-hover"
          aria-label="Account"
        >
          <Avatar name={user.displayName} tone="solid" size="lg" />
          <span className="hidden min-w-0 lg:block">
            <span className="block max-w-36 truncate text-base font-medium text-white">
              {user.displayName}
            </span>
            <span className="mt-1 block text-xs text-nav-foreground">{humanize(user.role)}</span>
          </span>
          <ChevronDown className="hidden size-4 text-white lg:block" />
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem icon={<UserRound />} onSelect={() => window.location.assign('/settings/profile')}>
          My profile
        </MenuItem>
        <MenuSeparator />
        <div className="px-3 pt-1 pb-1.5 text-xs text-fg-subtle">Theme</div>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="mx-1.5 mb-1.5 grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
        >
          {themeItems.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-[5px] py-1.5 text-2xs text-fg-subtle hover:text-fg [&_svg]:size-4',
                theme === t.value && 'bg-card text-fg shadow-card',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} danger onSelect={logout}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const user = useCurrentUser();
  const pathname = usePathname() ?? '/';
  const pending = usePendingApprovals().data?.length ?? 0;
  return (
    <nav
      aria-label="Main"
      className="flex h-full flex-col overflow-y-auto px-[15px] pt-[23px] pb-4 scrollbar-hide"
    >
      <ul className="space-y-[3px]">
        {primaryNav(user).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            collapsed={collapsed}
            count={item.href === '/' ? pending : 0}
          />
        ))}
      </ul>
      <div className="px-[9px] pt-[22px] pb-[14px]">
        <div className="h-px bg-nav-divider" />
      </div>
      <ul className="space-y-[3px]">
        {supportNav(user).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            collapsed={collapsed}
          />
        ))}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-2 pt-6">
        <Thorney collapsed={collapsed} />
        {onToggle && (
          <Tooltip label={`${collapsed ? 'Expand' : 'Collapse'} sidebar (⌘\\)`} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={cn(
                'rounded-md p-2 text-nav-foreground hover:bg-nav-hover hover:text-white',
                collapsed && 'hidden',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <PanelLeftClose className="size-5" />
              )}
            </button>
          </Tooltip>
        )}
      </div>
      {collapsed && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="mx-auto mt-2 rounded-md p-2 text-nav-foreground hover:bg-nav-hover hover:text-white"
        >
          <PanelLeftOpen className="size-5" />
        </button>
      )}
    </nav>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  count = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Tooltip label={item.label} side="right" disabled={!collapsed}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cn(
            'flex h-[49px] items-center gap-[22px] rounded-lg px-[18px] text-md text-nav-foreground transition-colors hover:bg-nav-hover hover:text-white',
            active &&
              'bg-gradient-to-r from-nav-active-from to-nav-active-to font-semibold text-white hover:bg-transparent',
            collapsed && 'justify-center gap-0 px-0',
          )}
        >
          <Icon className="size-6 shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && count > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-bold text-brand-foreground tnum"
              aria-label={`${count} waiting on you`}
            >
              {count}
            </span>
          )}
        </Link>
      </Tooltip>
    </li>
  );
}

/** Thorney, the brand mascot. Opens quick help; there is no chat assistant behind it. */
function Thorney({ collapsed }: { collapsed: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Help from Thorney"
          className="group shrink-0 rounded-lg p-1 hover:bg-nav-hover"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/thorney.png"
            alt=""
            className={cn(
              'w-auto transition-transform group-hover:-translate-y-0.5',
              collapsed ? 'h-12' : 'h-[72px]',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-72">
        <p className="text-base font-semibold text-fg">Hi, I&apos;m Thorney 👋</p>
        <p className="mt-1 text-sm text-fg-muted">A few things that save time:</p>
        <ul className="mt-3 space-y-2 text-sm text-fg-muted">
          <li>
            Press <kbd className="rounded-sm border border-border bg-muted px-1 text-2xs">/</kbd> to
            search candidates and jobs.
          </li>
          <li>
            Press <kbd className="rounded-sm border border-border bg-muted px-1 text-2xs">⌘\</kbd>{' '}
            to collapse the sidebar.
          </li>
          <li>Drag cards on the pipeline board to move candidates.</li>
        </ul>
        <Link
          href="/help"
          className="mt-3 inline-block text-sm font-medium text-accent-foreground hover:underline"
        >
          Open help →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
