'use client';

import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconArrowRight, IconBriefcase2, IconLock, IconShieldCheck } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, resetCsrfToken } from '../api';
import type { User } from '../types';

type DevUser = Pick<User, 'email' | 'displayName' | 'role'>;

export function LoginPage({ unavailable = false }: { unavailable?: boolean }) {
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } finally {
      setSigningIn(null);
    }
  };

  return (
    <Box className="login-page">
      <Container size={940} py={64}>
        <Group mb={54} gap="sm">
          <ThemeIcon size={38} radius="md" color="dark">
            <IconBriefcase2 size={21} />
          </ThemeIcon>
          <Text fw={700} size="lg" c="white">
            Internal ATS
          </Text>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={56}>
          <Stack gap="xl" justify="center">
            <div>
              <Text c="indigo.2" fw={700} size="sm" tt="uppercase" lts={1.4} mb="sm">
                Internal hiring workspace
              </Text>
              <Title order={1} c="white" fz={{ base: 38, sm: 52 }} lh={1.05}>
                Hiring work,
                <br />
                in one clear place.
              </Title>
              <Text c="gray.4" size="lg" mt="lg" maw={470}>
                Review applicants, manage resumes, schedule interviews, and make consistent hiring
                decisions.
              </Text>
            </div>
            <Group gap="xl">
              <Group gap="xs">
                <IconLock size={17} color="#a5b4fc" />
                <Text size="sm" c="gray.4">
                  Company access only
                </Text>
              </Group>
              <Group gap="xs">
                <IconShieldCheck size={17} color="#a5b4fc" />
                <Text size="sm" c="gray.4">
                  Audited actions
                </Text>
              </Group>
            </Group>
          </Stack>

          <Paper radius="xl" p={{ base: 'xl', sm: 34 }} shadow="xl" bg="white">
            <Title order={2} size="h3">
              Sign in
            </Title>
            <Text c="dimmed" mt={6} mb="xl">
              Use your company account to continue.
            </Text>

            {users.isPending ? (
              <Center py="xl">
                <Loader size="sm" />
              </Center>
            ) : users.data ? (
              <Stack gap="sm">
                <Alert color="blue" variant="light" title="Development mode">
                  Choose a test role. Production uses company SSO.
                </Alert>
                {users.data.map((user) => (
                  <Button
                    key={user.email}
                    variant="default"
                    h={62}
                    px="md"
                    justify="space-between"
                    loading={signingIn === user.email}
                    onClick={() => login(user.email)}
                    leftSection={
                      <Avatar size={34} radius="xl" color="indigo">
                        {user.displayName
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)}
                      </Avatar>
                    }
                    rightSection={<IconArrowRight size={16} />}
                  >
                    <Stack gap={0} align="flex-start" style={{ flex: 1 }}>
                      <Text fw={600} size="sm">
                        {user.displayName}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {user.role.replace(/([a-z])([A-Z])/g, '$1 $2')}
                      </Text>
                    </Stack>
                  </Button>
                ))}
              </Stack>
            ) : (
              <Stack>
                {unavailable && (
                  <Alert color="red">
                    Authentication is unavailable. Check the server configuration.
                  </Alert>
                )}
                <Button
                  component="a"
                  href="/auth/login?returnUrl=/"
                  rightSection={<IconArrowRight size={16} />}
                >
                  Continue with company SSO
                </Button>
              </Stack>
            )}
          </Paper>
        </SimpleGrid>
      </Container>
    </Box>
  );
}
