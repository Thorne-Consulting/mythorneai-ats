import type { ReactNode } from 'react';
import { ActionIcon, Anchor, Box, Group, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';

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
        <Anchor component={Link} href={backHref} size="sm" underline="always">
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
