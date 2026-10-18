'use client';

import type { ReactNode } from 'react';
import { ActionIcon, Paper, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconShieldLock,
} from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeaders';
import { useCollapsePref } from '@/lib/collapse-pref';
import { isAdmin, useAdminUsers } from './admin-data';

const GROUPS = [
  {
    label: 'Workspace',
    items: [
      { label: 'People', href: '/admin' },
      { label: 'Roles', href: '/admin/roles' },
      { label: 'Approvals', href: '/admin/approvals' },
      { label: 'Reminders', href: '/admin/reminders' },
      { label: 'Team notifications', href: '/admin/notifications' },
      { label: 'AI', href: '/admin/ai-settings' },
    ],
  },
  {
    label: 'Hiring',
    items: [
      { label: 'Pipelines', href: '/admin/pipelines' },
      { label: 'Candidate fields', href: '/admin/fields' },
      { label: 'Posting templates', href: '/admin/templates' },
      { label: 'Email templates', href: '/admin/email-templates' },
    ],
  },
  {
    label: 'Candidates',
    items: [
      { label: 'Candidate portal', href: '/admin/portal' },
      { label: 'Candidate email', href: '/admin/email' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { label: 'Microsoft and Google', href: '/admin/integrations' },
      { label: 'Webhooks', href: '/admin/webhooks' },
    ],
  },
  {
    label: 'Activity',
    items: [
      { label: 'AI activity', href: '/admin/ai' },
      { label: 'Audit log', href: '/admin/audit' },
    ],
  },
];

export function AdminShell({
  children,
  menuCollapsed,
}: {
  children: ReactNode;
  menuCollapsed: boolean;
}) {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();
  const pathname = usePathname();
  const [collapsed, toggle] = useCollapsePref('ats-settings-nav-collapsed', menuCollapsed);

  if (!isAdmin(currentUser.role)) {
    return (
      <Paper withBorder radius="lg" p={48} ta="center" maw={520} mx="auto" mt="xl">
        <ThemeIcon variant="light" color="gray" size={48} radius="md" mx="auto">
          <IconShieldLock size={24} stroke={1.6} />
        </ThemeIcon>
        <Title order={2} mt="md">
          Administrator access required
        </Title>
        <Text c="dimmed" mt="xs">
          Your account cannot view users or security audit data.
        </Text>
      </Paper>
    );
  }

  // Longest matching href wins, so /admin only lights up on the people page itself.
  const active = GROUPS.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <Tooltip label={collapsed ? 'Show settings menu' : 'Hide settings menu'} openDelay={300}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              visibleFrom="md"
              onClick={toggle}
              aria-label={collapsed ? 'Show settings menu' : 'Hide settings menu'}
              aria-expanded={!collapsed}
              aria-controls="settings-menu"
            >
              {collapsed ? (
                <IconLayoutSidebarLeftExpand size={18} stroke={1.7} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={18} stroke={1.7} />
              )}
            </ActionIcon>
          </Tooltip>
        }
      />
      <div className="settings-layout" data-collapsed={collapsed || undefined}>
        <nav id="settings-menu" className="settings-nav" aria-label="Settings">
          {GROUPS.map((group) => (
            <div key={group.label} className="settings-nav-group">
              <Text className="settings-nav-label">{group.label}</Text>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  data-active={item.href === active || undefined}
                  aria-current={item.href === active ? 'page' : undefined}
                >
                  <span className="nav-item-label">{item.label}</span>
                  {item.href === '/admin' && users.data && (
                    <span className="settings-nav-count tnum">{users.data.length}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </>
  );
}
