import { Button, Center, Stack, Text, Title } from '@mantine/core';

export function NotFoundPage() {
  return (
    <Center mih="60vh">
      <Stack align="center">
        <Text c="indigo" fw={700}>
          404
        </Text>
        <Title order={2}>Page not found</Title>
        <Text c="dimmed">The page may have moved or you may not have access.</Text>
        <Button component="a" href="/">
          Back to overview
        </Button>
      </Stack>
    </Center>
  );
}
