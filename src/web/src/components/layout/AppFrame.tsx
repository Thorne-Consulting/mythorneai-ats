'use client';

import {
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Group,
  Menu,
  ScrollArea,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import {
  IconAddressBook,
  IconBriefcase2,
  IconCalendarEvent,
  IconChartBar,
  IconHome2,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconSelector,
  IconSettings,
  type Icon,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth';
import { api, resetCsrfToken } from '@/api';
import { useCollapsePref } from '@/lib/collapse-pref';
import { humanize, initials } from '@/lib/format';
import type { User } from '@/types';
import { OrganizationSetupModal } from '@/features/admin/OrganizationSetupModal';
import { usePendingApprovals } from '@/features/approvals/approval-data';
import { CommandSearch, SearchTrigger, useSearchHotkeys } from './CommandSearch';

type NavItem = { label: string; href: string; icon: Icon; match?: string[] };

// Each role gets the doors it uses, in the order it uses them. Applications, people and talent
// search are one place (Candidates); approvals surface on Home with a count on that item.
function navigationFor(user: User): NavItem[] {
  const home = { label: 'Home', href: '/', icon: IconHome2, match: ['/approvals'] };
  const candidates = {
    label: 'Candidates',
    href: '/candidates',
    icon: IconAddressBook,
    match: ['/applications'],
  };
  const interviews = { label: 'Interviews', href: '/interviews', icon: IconCalendarEvent };
  if (user.role === 'Interviewer') return [home, interviews, candidates];
  const items: NavItem[] = [
    home,
    { label: 'Jobs', href: '/requisitions', icon: IconBriefcase2 },
    candidates,
    interviews,
  ];
  if (user.permissions.includes('reports'))
    items.push({ label: 'Reports', href: '/reports', icon: IconChartBar });
  return items;
}

function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return item.href === '/'
    ? pathname === '/' || (item.match ?? []).some((p) => pathname.startsWith(p))
    : prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppFrame({
  children,
  navCollapsed,
}: {
  children: React.ReactNode;
  navCollapsed: boolean;
}) {
  const [mobileOpened, mobile] = useDisclosure();
  const [searchOpened, search] = useDisclosure();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? '/';
  const pendingApprovals = usePendingApprovals().data?.length ?? 0;
  useSearchHotkeys(search.open);
  // Collapsed is a desktop idea; on small screens the sidebar is a drawer either way.
  const [collapsedPref, toggleCollapsed] = useCollapsePref('ats-nav-collapsed', navCollapsed);
  const collapsed = collapsedPref && !mobileOpened;
  useHotkeys([['mod+\\', toggleCollapsed]]);
  const tip = (label: string) => ({
    label,
    position: 'right' as const,
    disabled: !collapsed,
    openDelay: 200,
  });

  const logout = async () => {
    await api.post<void>('/api/auth/logout');
    resetCsrfToken();
    queryClient.clear();
    window.location.assign('/');
  };

  const nav = navigationFor(user);

  return (
    <>
      <AppShell
        header={{ height: { base: 52, md: 0 } }}
        navbar={{
          width: collapsed ? 60 : 240,
          breakpoint: 'md',
          collapsed: { mobile: !mobileOpened },
        }}
        padding={0}
      >
        <AppShell.Header className="app-header" hiddenFrom="md" withBorder>
          <Group h="100%" px="md" gap="sm" wrap="nowrap">
            <Burger
              opened={mobileOpened}
              onClick={mobile.toggle}
              size="sm"
              aria-label={mobileOpened ? 'Close navigation' : 'Open navigation'}
            />
            <Text fw={650} size="sm" truncate style={{ flex: 1 }}>
              {user.organizationName ?? 'Internal ATS'}
            </Text>
            <SearchTrigger onOpen={search.open} />
          </Group>
        </AppShell.Header>

        <AppShell.Navbar className="app-navbar" data-collapsed={collapsed || undefined} withBorder>
          <Box className="nav-workspace">
            <Box className="nav-mark" aria-hidden>
              {initials(user.organizationName ?? 'Internal ATS')}
            </Box>
            <Box className="nav-hide" style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={650} truncate>
                {user.organizationName ?? 'Internal ATS'}
              </Text>
              <Text size="xs" c="dimmed">
                Internal ATS
              </Text>
            </Box>
            <Tooltip label={`${collapsed ? 'Expand' : 'Collapse'} sidebar  ⌘\\`} openDelay={300}>
              <UnstyledButton
                className="nav-collapse"
                visibleFrom="md"
                onClick={toggleCollapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
              >
                {collapsed ? (
                  <IconLayoutSidebarLeftExpand size={17} stroke={1.7} />
                ) : (
                  <IconLayoutSidebarLeftCollapse size={17} stroke={1.7} />
                )}
              </UnstyledButton>
            </Tooltip>
          </Box>

          <Box px="sm" pb="sm" visibleFrom="md">
            <Tooltip {...tip('Search  /')}>
              <Box>
                <SearchTrigger onOpen={search.open} />
              </Box>
            </Tooltip>
          </Box>

          <AppShell.Section grow component={ScrollArea} type="scroll" px="sm">
            <nav aria-label="Main">
              {nav.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Tooltip key={item.href} {...tip(item.label)}>
                    <Link
                      href={item.href}
                      className="nav-item"
                      data-active={active || undefined}
                      aria-current={active ? 'page' : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      onClick={mobile.close}
                    >
                      <item.icon size={17} stroke={1.7} aria-hidden />
                      <span className="nav-item-label">{item.label}</span>
                      {item.href === '/' && pendingApprovals > 0 && (
                        <Badge
                          size="sm"
                          circle
                          aria-label={`${pendingApprovals} waiting on you`}
                          className="nav-count"
                        >
                          {pendingApprovals}
                        </Badge>
                      )}
                    </Link>
                  </Tooltip>
                );
              })}
            </nav>
          </AppShell.Section>

          <Box className="nav-footer">
            {user.role === 'Admin' && (
              <Tooltip {...tip('Settings')}>
                <Link
                  href="/admin"
                  className="nav-item"
                  data-active={pathname.startsWith('/admin') || undefined}
                  aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
                  aria-label={collapsed ? 'Settings' : undefined}
                  onClick={mobile.close}
                >
                  <IconSettings size={17} stroke={1.7} aria-hidden />
                  <span className="nav-item-label">Settings</span>
                </Link>
              </Tooltip>
            )}
            <Menu position="top-start" width={220} offset={6}>
              <Menu.Target>
                <UnstyledButton className="nav-user" aria-label="Account">
                  <Avatar size={28} radius="xl" color="indigo">
                    {initials(user.displayName)}
                  </Avatar>
                  <Box className="nav-hide" style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600} truncate>
                      {user.displayName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {humanize(user.role)}
                    </Text>
                  </Box>
                  <IconSelector size={15} aria-hidden className="nav-hide" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Box>
        </AppShell.Navbar>

        <AppShell.Main className="app-main">
          <div className="page-container">{children}</div>
        </AppShell.Main>
      </AppShell>
      <CommandSearch opened={searchOpened} onClose={search.close} />
      <OrganizationSetupModal
        opened={user.isOrganizationOwner && !user.organizationSetupCompleted}
      />
    </>
  );
}
