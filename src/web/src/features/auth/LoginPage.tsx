'use client';

import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowRight, IconBriefcase2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api, resetCsrfToken } from '@/api';
import { humanize, initials } from '@/lib/format';
import type { User } from '@/types';

type DevUser = Pick<User, 'email' | 'displayName' | 'role'>;

export function LoginPage({ unavailable = false }: { unavailable?: boolean }) {
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const users = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api.get<DevUser[]>('/api/auth/dev-users'),
    retry: false,
  });

  const login = async (email: string) => {
    setSigningIn(email);
    try {
      resetCsrfToken();
      await api.devLogin(email);
      window.location.assign('/');
    } finally {
      setSigningIn(null);
    }
  };

  return (
    <Center mih="100dvh" p="md" bg="var(--surface-sunken)">
      <Box w="100%" maw={400}>
        <Stack align="center" gap={6} mb="xl">
          <ThemeIcon
            size={42}
            radius="md"
            variant="gradient"
            gradient={{ from: 'indigo.6', to: 'violet.5', deg: 135 }}
          >
            <IconBriefcase2 size={22} />
          </ThemeIcon>
          <Title order={2} mt="xs">
            Internal ATS
          </Title>
          <Text size="sm" c="dimmed">
            Sign in with your company account.
          </Text>
        </Stack>

        <Paper withBorder radius="lg" p="lg" bg="var(--mantine-color-body)">
          {users.isPending ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : users.data ? (
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={500} mb={2}>
                Development sign-in
              </Text>
              {users.data.map((user) => (
                <UnstyledButton
                  key={user.email}
                  className="login-option"
                  disabled={signingIn !== null}
                  onClick={() => login(user.email)}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Avatar size={34} radius="xl" color="indigo" variant="light">
                      {initials(user.displayName)}
                    </Avatar>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={600} size="sm" truncate>
                        {user.displayName}
                      </Text>
                      <Text c="dimmed" size="xs" truncate>
                        {humanize(user.role)}
                      </Text>
                    </Box>
                    {signingIn === user.email ? (
                      <Loader size={15} />
                    ) : (
                      <IconArrowRight size={16} color="var(--mantine-color-dimmed)" />
                    )}
                  </Group>
                </UnstyledButton>
              ))}
              <Text size="xs" c="dimmed" mt={4}>
                Production uses company SSO.
              </Text>
            </Stack>
          ) : (
            <Stack gap="md">
              {unavailable && (
                <Alert color="red" variant="light">
                  Authentication is unavailable. Check the server configuration.
                </Alert>
              )}
              <Button
                component="a"
                href="/auth/login?returnUrl=/"
                fullWidth
                size="md"
                rightSection={<IconArrowRight size={16} />}
              >
                Continue with company SSO
              </Button>
            </Stack>
          )}
        </Paper>
      </Box>
    </Center>
  );
}
