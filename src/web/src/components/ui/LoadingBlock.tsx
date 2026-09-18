import { Group, Paper, Skeleton, Stack } from '@mantine/core';

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
