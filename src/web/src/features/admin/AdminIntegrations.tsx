'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Clock, PlugZap, RotateCw } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Badge, Button, Card, IconDisc, StatCard, StatGrid, toast } from '@/components/ui';
import { type IntegrationStatus, isAdmin } from './admin-data';
import { SettingsLoading } from './settings-shared';

const PROVIDER_LABEL: Record<IntegrationStatus['provider'], string> = {
  None: 'None',
  Microsoft365: 'Microsoft 365',
  GoogleWorkspace: 'Google Workspace',
};

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
      toast.success(`${result.count} failed deliveries queued`);
    },
    onError: (error: Error) => toast.error('Could not retry', error.message),
  });

  if (!integration.data) return <SettingsLoading rows={2} />;
  const status = integration.data;
  const provider = PROVIDER_LABEL[status.provider] ?? status.provider;

  return (
    <>
      <Card className="flex flex-wrap items-start gap-4 p-5">
        <IconDisc icon={PlugZap} tone={status.enabled ? 'blue' : 'gray'} size="md" />
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-lg font-semibold text-fg">
            {status.enabled ? provider : 'Internal-only mode'}
          </h2>
          <p className="mt-0.5 text-sm text-fg-subtle">
            {status.enabled
              ? `Interview invitations use ${provider}.`
              : 'No external calendar provider is active. Interviews stay visible inside the ATS.'}
          </p>
        </div>
        <Badge dot tone={status.enabled ? 'green' : 'gray'}>
          {status.enabled ? 'Configured' : 'Not configured'}
        </Badge>
      </Card>

      <StatGrid className="xl:grid-cols-3">
        <StatCard
          icon={CalendarDays}
          label="Calendar"
          value={<span className="text-xl">{status.calendar}</span>}
        />
        <StatCard
          icon={Clock}
          tone="amber"
          label="Queued deliveries"
          value={status.pending}
          hint="Waiting to send"
        />
        <StatCard
          icon={AlertTriangle}
          tone={status.failed > 0 ? 'red' : 'green'}
          label="Failed deliveries"
          value={status.failed}
          hint={status.failed ? 'Needs a retry' : 'Nothing to retry'}
        />
      </StatGrid>

      {status.failed > 0 && (
        <div>
          <Button
            variant="secondary"
            leftIcon={<RotateCw />}
            loading={retryFailed.isPending}
            onClick={() => retryFailed.mutate()}
          >
            Retry {status.failed} failed
          </Button>
        </div>
      )}
    </>
  );
}
