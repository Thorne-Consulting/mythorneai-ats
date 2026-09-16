import type { ReactNode } from 'react';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

const statusColors: Record<string, string> = {
  Open: 'teal',
  Active: 'teal',
  Accepted: 'teal',
  Hired: 'teal',
  Approved: 'blue',
  Sent: 'blue',
  Scheduled: 'violet',
  Draft: 'gray',
  OnHold: 'yellow',
  Rejected: 'red',
  Declined: 'red',
  Cancelled: 'red',
  Withdrawn: 'gray',
  Closed: 'gray',
  Filled: 'indigo',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="light" color={statusColors[status] ?? 'gray'} tt="none">{status.replace(/([a-z])([A-Z])/g, '$1 $2')}</Badge>;
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="xl" gap="md">
      <div>
        {eyebrow && <Text size="xs" fw={750} c="indigo" tt="uppercase" lts={1.1} mb={5}>{eyebrow}</Text>}
        <Title order={1} fz={{ base: 27, sm: 32 }} lh={1.15}>{title}</Title>
        {description && <Text c="dimmed" mt={7} maw={680}>{description}</Text>}
      </div>
      {actions && <Group>{actions}</Group>}
    </Group>
  );
}

export function EmptyState({ icon: IconComponent, title, description, actionLabel, onAction }: { icon: Icon; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Paper withBorder radius="lg" p={48}>
      <Stack align="center" gap="sm" ta="center">
        <IconComponent size={34} color="var(--mantine-color-gray-5)" stroke={1.5} />
        <Text fw={700}>{title}</Text>
        <Text size="sm" c="dimmed" maw={420}>{description}</Text>
        {actionLabel && <Button mt="sm" variant="light" onClick={onAction}>{actionLabel}</Button>}
      </Stack>
    </Paper>
  );
}

export function LoadingBlock() {
  return <Paper withBorder radius="lg" p="xl"><Text c="dimmed">Loading…</Text></Paper>;
}

export function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
