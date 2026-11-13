'use client';

import { AlertTriangle, WifiOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api';
import { Button, Card, EmptyState } from '@/components/ui';
import type { ApplicationDetailResponse } from '@/types';

export function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={WifiOff}
        title="You appear to be offline"
        description="Check your connection, then try again."
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </Card>
  );
}

/** Every route on this surface needs somewhere to land when the load fails. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title={
          missing ? 'This application is no longer available' : 'Could not load this application'
        }
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </Card>
  );
}

export function useApplication(id: string, initialData?: ApplicationDetailResponse) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${id}`),
    initialData,
    refetchInterval: (current) =>
      current.state.data?.application.interviews.some((item) =>
        ['Queued', 'RetryScheduled', 'CancellationQueued'].includes(item.calendarStatus),
      )
        ? 2000
        : false,
  });
}

export function useInvalidateApplication(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['application', id] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['applicants'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export const canManageRole = (role: string) =>
  ['Admin', 'Recruiter', 'HiringManager'].includes(role);
