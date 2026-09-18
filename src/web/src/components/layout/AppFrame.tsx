'use client';

import {
  AppShell,
  Avatar,
  Box,
  Burger,
  Divider,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAddressBook,
  IconBriefcase2,
  IconChevronDown,
  IconClipboardList,
  IconLayoutDashboard,
  IconLogout,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth';
import { api, resetCsrfToken } from '@/api';
import { humanize, initials } from '@/lib/format';

const navigation = [
  { label: 'Overview', to: '/', icon: IconLayoutDashboard },
  { label: 'Jobs', to: '/requisitions', icon: IconBriefcase2 },
  { label: 'Applications', to: '/applicants', icon: IconClipboardList },
  { label: 'Candidates', to: '/candidates', icon: IconAddressBook },
] as const;

import { GlobalSearch } from './GlobalSearch';

const HEADER_HEIGHT = 60;
const NAVBAR_WIDTH = 256;

export function AppFrame({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? '/';
  const canAdmin = user.role === 'Admin';

  const logout = async () => {
    await api.post<void>('/api/auth/logout');
    resetCsrfToken();
    queryClient.clear();
    window.location.assign('/');
  };

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: NAVBAR_WIDTH, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding={{ base: 'md', sm: 'lg', lg: 'xl' }}
    >
      <AppShell.Header className="app-header" withBorder>
        <Group h="100%" px={{ base: 'sm', md: 'md' }} gap="md" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" w={{ md: NAVBAR_WIDTH - 16 }} style={{ flexShrink: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Group gap="sm" wrap="nowrap">
                <ThemeIcon
                  size={32}
                  radius="md"
                  variant="gradient"
                  gradient={{ from: 'indigo.6', to: 'violet.5', deg: 135 }}
                >
                  <IconBriefcase2 size={18} />
                </ThemeIcon>
                <Text fw={700} visibleFrom="sm" style={{ whiteSpace: 'nowrap' }}>
                  Internal{' '}
                  <Text span c="dimmed" fw={500}>
                    ATS
                  </Text>
                </Text>
              </Group>
            </Link>
          </Group>

          <GlobalSearch />

          <Menu position="bottom-end" width={230} withArrow>
            <Menu.Target>
              <UnstyledButton
                p={4}
                ml="auto"
                style={{ borderRadius: 'var(--mantine-radius-md)', flexShrink: 0 }}
              >
                <Group gap="xs" wrap="nowrap">
                  <Avatar size={32} color="indigo" radius="xl">
                    {initials(user.displayName)}
                  </Avatar>
                  <Box visibleFrom="md" maw={150}>
                    <Text size="sm" fw={600} lineClamp={1}>
                      {user.displayName}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {humanize(user.role)}
                    </Text>
                  </Box>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              {canAdmin && (
                <Menu.Item component={Link} href="/admin" leftSection={<IconSettings size={16} />}>
                  Administration
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" className="app-navbar">
        <AppShell.Section grow component={ScrollArea} type="scroll">
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={1} px="sm" pt="xs" pb={6}>
            Workspace
          </Text>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              href={item.to}
              label={item.label}
              variant="light"
              mb={2}
              leftSection={<item.icon size={18} stroke={1.7} />}
              onClick={close}
              active={
                pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`))
              }
            />
          ))}
          {canAdmin && (
            <>
              <Divider my="md" />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={1} px="sm" pb={6}>
                System
              </Text>
              <NavLink
                component={Link}
                href="/admin"
                label="Administration"
                variant="light"
                leftSection={<IconSettings size={18} stroke={1.7} />}
                onClick={close}
                active={pathname.startsWith('/admin')}
              />
            </>
          )}
        </AppShell.Section>
        <AppShell.Section>
          <Divider mb="sm" />
          <Group gap={6} px="sm" pb="xs" wrap="nowrap">
            <IconUsers size={14} color="var(--mantine-color-dimmed)" />
            <Text size="xs" c="dimmed">
              Internal use only
            </Text>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="app-main">
        <div className="page-container">{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}
