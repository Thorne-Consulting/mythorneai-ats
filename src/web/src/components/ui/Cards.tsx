import type { ReactNode } from 'react';
import { Box, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

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
