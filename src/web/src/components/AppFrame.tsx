'use client';

import { useRef, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Divider,
  Group,
  Kbd,
  Menu,
  NavLink,
  Paper,
  ScrollArea,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useClickOutside, useDebouncedValue, useDisclosure, useHotkeys } from '@mantine/hooks';
import {
  IconAddressBook,
  IconBriefcase2,
  IconChevronDown,
  IconClipboardList,
  IconLayoutDashboard,
  IconLogout,
  IconSearch,
  IconSettings,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '../auth';
import { api, resetCsrfToken } from '../api';
import { humanize, initials } from './Common';

const navigation = [
  { label: 'Overview', to: '/', icon: IconLayoutDashboard },
  { label: 'Jobs', to: '/requisitions', icon: IconBriefcase2 },
  { label: 'Applications', to: '/applicants', icon: IconClipboardList },
  { label: 'Candidates', to: '/candidates', icon: IconAddressBook },
] as const;

const HEADER_HEIGHT = 60;
const NAVBAR_WIDTH = 256;

export function AppFrame({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const router = useRouter();
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

function GlobalSearch() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 250);
  const clickOutsideRef = useClickOutside(() => setSearch(''));
  const inputRef = useRef<HTMLInputElement>(null);
  // "/" focuses search, matching the hint in the field. Mantine ignores the
  // hotkey while an input already has focus.
  useHotkeys([['/', () => inputRef.current?.focus()]]);
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () =>
      api.get<{
        requisitions: Array<{ id: string; code: string; title: string }>;
        candidates: Array<{ id: string; name: string; email: string }>;
      }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });
  const open = search.trim().length >= 2;
  const go = (path: string) => {
    setSearch('');
    router.push(path);
  };
  const empty =
    results.data && results.data.requisitions.length === 0 && results.data.candidates.length === 0;

  return (
    <Box ref={clickOutsideRef} pos="relative" style={{ flex: 1, maxWidth: 520 }}>
      <TextInput
        ref={inputRef}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setSearch('');
          event.currentTarget.blur();
        }}
        placeholder="Search candidates and jobs…"
        aria-label="Search candidates and jobs"
        leftSection={<IconSearch size={16} />}
        rightSection={
          search ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <IconX size={15} />
            </ActionIcon>
          ) : (
            <Kbd size="xs" visibleFrom="md">
              /
            </Kbd>
          )
        }
        rightSectionWidth={search ? undefined : 40}
      />
      {open && (
        <Paper className="search-results" withBorder radius="md" shadow="lg">
          {results.isFetching && !results.data && (
            <Text size="sm" c="dimmed" p="md">
              Searching…
            </Text>
          )}
          {results.data?.requisitions.map((item) => (
            <UnstyledButton
              key={item.id}
              className="search-result"
              onClick={() => go(`/requisitions/${item.id}`)}
            >
              <ThemeIcon variant="light" color="indigo" size="sm">
                <IconBriefcase2 size={13} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {item.title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {item.code} · Job
                </Text>
              </Box>
            </UnstyledButton>
          ))}
          {results.data?.candidates.map((item) => (
            <UnstyledButton
              key={item.id}
              className="search-result"
              onClick={() => go(`/candidates/${item.id}`)}
            >
              <ThemeIcon variant="light" color="teal" size="sm">
                <IconAddressBook size={13} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {item.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {item.email}
                </Text>
              </Box>
            </UnstyledButton>
          ))}
          {empty && (
            <Text size="sm" c="dimmed" p="md">
              No matching records
            </Text>
          )}
        </Paper>
      )}
    </Box>
  );
}
