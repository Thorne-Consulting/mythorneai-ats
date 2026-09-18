'use client';

import { Badge, Button, Group, Paper, SimpleGrid, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { StatCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { type IntegrationStatus, isAdmin } from './admin-data';

export function AdminIntegrations() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const integration = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: () => api.get<IntegrationStatus>('/api/admin/integrations'),
    enabled: isAdmin(currentUser.role),
  });
  const retryFailed = useMutation({
    mutationFn: () => api.post<{ count: number }>('/api/admin/integrations/retry-failed'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      notifications.show({ color: 'teal', message: `${result.count} failed deliveries queued` });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  if (!integration.data) return <LoadingBlock rows={2} />;
  const status = integration.data;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 260px' }}>
          <Title order={3}>Calendar delivery</Title>
          <Text c="dimmed" size="sm">
            How interview invitations reach Microsoft 365 or Google Workspace.
          </Text>
        </div>
        {status.failed > 0 && (
          <Button
            color="red"
            variant="light"
            loading={retryFailed.isPending}
            onClick={() => retryFailed.mutate()}
          >
            Retry {status.failed} failed
          </Button>
        )}
      </Group>

      <Paper withBorder radius="lg" p="xl" mb="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group align="flex-start" wrap="nowrap" style={{ flex: '1 1 300px' }}>
            <ThemeIcon variant="light" color="indigo" size={42} radius="md">
              <IconPlugConnected size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>{status.enabled ? status.provider : 'Internal-only mode'}</Title>
              <Text c="dimmed" size="sm" mt={4}>
                {status.enabled
                  ? `Interview invitations use ${status.provider}.`
                  : 'No external calendar provider is active. Interviews stay visible inside the ATS.'}
              </Text>
            </div>
          </Group>
          <Badge color={status.enabled ? 'teal' : 'gray'} variant="light" size="lg">
            {status.enabled ? 'Configured' : 'Not configured'}
          </Badge>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard label="Calendar" text={status.calendar} />
        <StatCard label="Queued deliveries" value={status.pending} hint="Waiting to send" />
        <StatCard
          label="Failed deliveries"
          value={status.failed}
          hint={status.failed ? 'Needs a retry' : 'Nothing to retry'}
          danger={status.failed > 0}
        />
      </SimpleGrid>
    </>
  );
}
