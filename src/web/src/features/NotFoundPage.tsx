import { Button, Center, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCompassOff } from '@tabler/icons-react';

export function NotFoundPage() {
  return (
    <Center mih="100dvh" p="md" bg="var(--surface-sunken)">
      <Paper withBorder radius="lg" p={40} maw={400} w="100%" bg="var(--mantine-color-body)">
        <Stack align="center" gap="xs" ta="center">
          <ThemeIcon variant="light" color="gray" size={44} radius="md">
            <IconCompassOff size={22} stroke={1.6} />
          </ThemeIcon>
          <Title order={3} mt="xs">
            Page not found
          </Title>
          <Text size="sm" c="dimmed">
            The page may have moved, or you may not have access to it.
          </Text>
          <Button component="a" href="/" mt="md">
            Back to overview
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
