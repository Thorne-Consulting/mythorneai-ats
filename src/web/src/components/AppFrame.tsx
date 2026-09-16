import { useState } from 'react';
import {
  ActionIcon,
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
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useDebouncedValue } from '@mantine/hooks';
import {
  IconBriefcase2,
  IconChevronDown,
  IconClipboardCheck,
  IconLayoutDashboard,
  IconLogout,
  IconSearch,
  IconSettings,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '../auth';
import { api, resetCsrfToken } from '../api';

const navigation = [
  { label: 'Overview', to: '/', icon: IconLayoutDashboard },
  { label: 'Requisitions', to: '/requisitions', icon: IconBriefcase2 },
  { label: 'Candidates', to: '/candidates', icon: IconUsers },
  { label: 'My tasks', to: '/tasks', icon: IconClipboardCheck },
] as const;

export function AppFrame() {
  const [opened, { toggle, close }] = useDisclosure();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 250);
  const searchResults = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ requisitions: Array<{ id: string; code: string; title: string }>; candidates: Array<{ id: string; name: string; email: string }> }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });

  const logout = async () => {
    await api.post<void>('/api/auth/logout');
    resetCsrfToken();
    queryClient.clear();
    window.location.assign('/');
  };

  const initials = user.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2);
  const canAdmin = user.role === 'Admin';

  return (
    <AppShell
      header={{ height: 68 }}
      navbar={{ width: 248, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding={{ base: 'md', sm: 'xl' }}
    >
      <AppShell.Header className="app-header">
        <Group h="100%" px={{ base: 'md', md: 'xl' }} justify="space-between" wrap="nowrap">
          <Group gap="sm" w={{ md: 224 }} wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
            <ThemeIcon size={34} radius="md" color="dark"><IconBriefcase2 size={19} /></ThemeIcon>
            <Text fw={750} visibleFrom="xs">MyThorneAI <Text span c="dimmed" fw={500}>ATS</Text></Text>
          </Group>

          <Box className="global-search" pos="relative">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search candidates and jobs…"
              leftSection={<IconSearch size={16} />}
              rightSection={search ? <ActionIcon variant="subtle" color="gray" onClick={() => setSearch('')}><IconX size={15} /></ActionIcon> : undefined}
            />
            {search.trim().length >= 2 && (
              <Box className="search-results">
                {searchResults.isFetching && <Text size="sm" c="dimmed" p="md">Searching…</Text>}
                {searchResults.data?.requisitions.map((item) => (
                  <UnstyledButton key={item.id} className="search-result" onClick={() => { setSearch(''); navigate({ to: '/requisitions/$id', params: { id: item.id } }); }}>
                    <ThemeIcon variant="light" color="indigo" size="sm"><IconBriefcase2 size={13} /></ThemeIcon>
                    <div><Text size="sm" fw={600}>{item.title}</Text><Text size="xs" c="dimmed">{item.code} · Requisition</Text></div>
                  </UnstyledButton>
                ))}
                {searchResults.data?.candidates.map((item) => (
                  <UnstyledButton key={item.id} className="search-result" onClick={() => { setSearch(''); navigate({ to: '/candidates/$id', params: { id: item.id } }); }}>
                    <ThemeIcon variant="light" color="teal" size="sm"><IconUsers size={13} /></ThemeIcon>
                    <div><Text size="sm" fw={600}>{item.name}</Text><Text size="xs" c="dimmed">{item.email}</Text></div>
                  </UnstyledButton>
                ))}
                {searchResults.data && searchResults.data.requisitions.length === 0 && searchResults.data.candidates.length === 0 && <Text size="sm" c="dimmed" p="md">No matching records</Text>}
              </Box>
            )}
          </Box>

          <Menu position="bottom-end" width={230}>
            <Menu.Target>
              <UnstyledButton className="account-button">
                <Group gap="sm" wrap="nowrap">
                  <Avatar size={34} color="indigo" radius="xl">{initials}</Avatar>
                  <Box visibleFrom="sm">
                    <Text size="sm" fw={650} lineClamp={1}>{user.displayName}</Text>
                    <Text size="xs" c="dimmed">{user.role.replace(/([a-z])([A-Z])/g, '$1 $2')}</Text>
                  </Box>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              {canAdmin && <Menu.Item component={Link} to="/admin" leftSection={<IconSettings size={16} />}>Administration</Menu.Item>}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>Sign out</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="app-navbar">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={1.2} px="sm" pt="xs" pb="sm">Workspace</Text>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={19} stroke={1.8} />}
              onClick={close}
              className="sidebar-link"
              activeProps={{ className: 'sidebar-link active' }}
            />
          ))}
          {canAdmin && (
            <>
              <Divider my="lg" />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={1.2} px="sm" pb="sm">System</Text>
              <NavLink component={Link} to="/admin" label="Administration" leftSection={<IconSettings size={19} stroke={1.8} />} onClick={close} className="sidebar-link" activeProps={{ className: 'sidebar-link active' }} />
            </>
          )}
        </AppShell.Section>
        <AppShell.Section p="sm">
          <Text size="xs" c="dimmed">Internal use only</Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="app-main"><Outlet /></AppShell.Main>
    </AppShell>
  );
}
