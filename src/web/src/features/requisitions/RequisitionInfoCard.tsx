import { Group, Paper, Text, ThemeIcon } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';

export function RequisitionInfoCard({
  icon: IconComponent,
  label,
  value,
  hint,
}: {
  icon: Icon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color="indigo" size={38} radius="md">
          <IconComponent size={19} stroke={1.7} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={500}>
            {label}
          </Text>
          <Text size="sm" fw={650} truncate mt={3} tt="capitalize">
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" truncate>
              {hint}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
}
