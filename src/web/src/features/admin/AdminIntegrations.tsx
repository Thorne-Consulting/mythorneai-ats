'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, RotateCw } from 'lucide-react';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import { Badge, Button, Card, IconDisc, toast } from '@/components/ui';
import { type IntegrationStatus } from './admin-data';
import { SettingsLoading } from './settings-shared';

const PROVIDER_LABEL: Record<IntegrationStatus['provider'], string> = {
  None: 'None',
  Microsoft365: 'Microsoft 365',
  GoogleWorkspace: 'Google Workspace',
};

/** Where interview invites go for the whole workspace, and the ones that did not get there. */
export function AdminIntegrations() {
  const ability = useAbility();
  const queryClient = useQueryClient();
  const integration = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: () => api.get<IntegrationStatus>('/api/admin/integrations'),
    enabled: ability.can('manage', 'Workspace'),
  });
  const retryFailed = useMutation({
    mutationFn: () => api.post<{ count: number }>('/api/admin/integrations/retry-failed'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      toast.success(
        result.count === 1
          ? '1 invitation will be sent again'
          : `${result.count} invitations will be sent again`,
      );
    },
    onError: (error: Error) => toast.error('Could not resend invitations', error.message),
  });

  if (!integration.data) return <SettingsLoading rows={2} />;
  const status = integration.data;
  const provider = PROVIDER_LABEL[status.provider] ?? status.provider;

  return (
    <Card className="flex flex-wrap items-start gap-4 p-5">
      <IconDisc icon={PlugZap} tone={status.enabled ? 'blue' : 'gray'} size="md" />
      <div className="min-w-0 flex-1 basis-64 space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-fg">
            {status.enabled ? provider : 'No workspace calendar'}
          </h2>
          <p className="mt-0.5 text-sm text-fg-subtle">
            {status.enabled ? (
              `Interview invites are added to ${provider} calendars.`
            ) : (
              <>
                Each person can connect their own calendar under{' '}
                <Link
                  href="/settings/availability"
                  className="text-accent-foreground hover:underline"
                >
                  Calendar and hours
                </Link>
                . Without one, invites go out by email with a calendar file.
              </>
            )}
          </p>
        </div>
        {(status.pending > 0 || status.failed > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {status.pending > 0 && (
              <Badge tone="amber" size="sm">
                {status.pending} waiting to send
              </Badge>
            )}
            {status.failed > 0 && (
              <Badge tone="red" size="sm">
                {status.failed} failed
              </Badge>
            )}
          </div>
        )}
      </div>
      {status.failed > 0 && (
        <Button
          variant="secondary"
          leftIcon={<RotateCw />}
          loading={retryFailed.isPending}
          onClick={() => retryFailed.mutate()}
        >
          {status.failed === 1 ? 'Resend 1 invitation' : `Resend ${status.failed} invitations`}
        </Button>
      )}
    </Card>
  );
}
