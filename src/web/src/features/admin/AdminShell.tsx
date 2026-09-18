'use client';

import type { ReactNode } from 'react';
import { Paper, Text, ThemeIcon, Title } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { useCurrentUser } from '@/auth';
import { PageHeader } from '@/components/ui/PageHeaders';
import { PageTabs } from '@/components/ui/PageTabs';
import { isAdmin, useAdminUsers } from './admin-data';

export function AdminShell({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();

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

  return (
    <>
      <PageHeader
        title="Administration"
        description="Access control and immutable system activity."
      />
      <PageTabs
        items={[
          { label: 'Users and roles', href: '/admin', count: users.data?.length },
          { label: 'Microsoft and Google', href: '/admin/integrations' },
          { label: 'Audit log', href: '/admin/audit' },
        ]}
      />
      {children}
    </>
  );
}
