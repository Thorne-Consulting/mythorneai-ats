'use client';

import type { ReactNode } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, type Icon } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

export function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function StatusBadge({ status, size }: { status: string; size?: string }) {
  return (
    <Badge variant="light" size={size} color={statusColors[status] ?? 'gray'}>
      {humanize(status)}
    </Badge>
  );
}

/** Title block for list pages. Actions wrap under the title on narrow screens. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="xl">
      <Box style={{ flex: '1 1 320px' }}>
        {eyebrow && (
          <Text size="xs" fw={700} c="indigo" tt="uppercase" lts={1.1} mb={4}>
            {eyebrow}
          </Text>
        )}
        <Title order={1}>{title}</Title>
        {description && (
          <Text c="dimmed" mt={6} maw={680}>
            {description}
          </Text>
        )}
      </Box>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}

/** Title block for detail pages: breadcrumb, optional back button, avatar, actions. */
export function DetailHeader({
  backHref,
  backLabel,
  current,
  avatar,
  title,
  badges,
  subtitle,
  meta,
  actions,
}: {
  backHref: string;
  backLabel: string;
  current: string;
  avatar?: ReactNode;
  title: string;
  badges?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box mb="xl">
      <Group gap="xs" mb="sm" wrap="nowrap">
        <ActionIcon
          component={Link}
          href={backHref}
          variant="subtle"
          color="gray"
          aria-label={`Back to ${backLabel.toLowerCase()}`}
        >
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Anchor component={Link} href={backHref} size="sm" c="dimmed">
          {backLabel}
        </Anchor>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {current}
        </Text>
      </Group>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group align="flex-start" wrap="nowrap" style={{ flex: '1 1 340px' }}>
          {avatar}
          <Box style={{ minWidth: 0 }}>
            <Group gap="sm" wrap="wrap">
              <Title order={1}>{title}</Title>
              {badges}
            </Group>
            {subtitle && (
              <Text c="dimmed" mt={4}>
                {subtitle}
              </Text>
            )}
            {meta}
          </Box>
        </Group>
        {actions && (
          <Group gap="sm" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Box>
  );
}

/** Small labelled figure used in the summary strips above tables and boards. */
export function StatCard({
  label,
  value,
  text,
  hint,
  danger,
}: {
  label: string;
  value?: number;
  text?: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <Paper withBorder radius="lg" p="md">
      <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.5}>
        {label}
      </Text>
      {value !== undefined ? (
        <Text fz={26} fw={650} lh={1.2} mt={4} className="tnum" c={danger ? 'red' : undefined}>
          {value}
        </Text>
      ) : (
        <Text fw={650} mt={6}>
          {text}
        </Text>
      )}
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

/**
 * Makes a table row behave like a link for the keyboard as well as the mouse.
 * Spread onto <Table.Tr>.
 */
export function rowLinkProps(label: string, open: () => void) {
  return {
    className: 'clickable-row',
    role: 'link',
    tabIndex: 0,
    'aria-label': label,
    onClick: open,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      open();
    },
  };
}

/** Neutral badge for a pipeline stage. Stages are not statuses and do not share their colours. */
export function StageBadge({ stage, size = 'sm' }: { stage: string; size?: string }) {
  return (
    <Badge variant="default" size={size} fw={600}>
      {stage}
    </Badge>
  );
}

export interface PageTab {
  label: string;
  href: string;
  count?: number;
}

/**
 * Section navigation rendered as real links, so every tab is its own URL and
 * survives a reload, a bookmark, and the back button.
 */
export function PageTabs({ items }: { items: PageTab[] }) {
  const pathname = usePathname() ?? '';
  const active =
    items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? items[0]?.href;

  return (
    <Tabs value={active} mb="xl">
      <Tabs.List>
        {items.map((item) => (
          <Tabs.Tab
            key={item.href}
            value={item.href}
            renderRoot={(props) => <Link href={item.href} {...props} />}
            rightSection={
              item.count ? (
                <Badge size="xs" variant="light" circle>
                  {item.count}
                </Badge>
              ) : undefined
            }
          >
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

/** Bordered panel with a header strip. Pass `padded` for plain body content. */
export function SectionCard({
  title,
  description,
  action,
  padded = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <Paper
      withBorder
      radius="lg"
      h="100%"
      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm" p="lg">
        <Box style={{ flex: '1 1 200px' }}>
          <Text fw={650}>{title}</Text>
          {description && (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          )}
        </Box>
        {action}
      </Group>
      <Divider />
      <Box style={{ flex: 1 }} p={padded ? 'lg' : undefined}>
        {children}
      </Box>
    </Paper>
  );
}

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: Icon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Paper withBorder radius="lg" p={48}>
      <Stack align="center" gap="sm" ta="center">
        <IconComponent size={34} color="var(--mantine-color-gray-5)" stroke={1.5} />
        <Text fw={650}>{title}</Text>
        <Text size="sm" c="dimmed" maw={420}>
          {description}
        </Text>
        {actionLabel && (
          <Button mt="sm" variant="light" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <Paper withBorder radius="lg" p="lg" aria-busy="true">
      <Stack gap="md">
        {Array.from({ length: rows }, (_, index) => (
          <Group key={index} wrap="nowrap">
            <Skeleton circle height={34} />
            <Stack gap={7} style={{ flex: 1 }}>
              <Skeleton height={9} width={`${60 - index * 6}%`} radius="xl" />
              <Skeleton height={8} width={`${40 - index * 4}%`} radius="xl" />
            </Stack>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

export function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
