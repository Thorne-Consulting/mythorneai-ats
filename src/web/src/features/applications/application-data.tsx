'use client';

import { IconAlertTriangle, IconWifiOff } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api';
import type { ApplicationDetailResponse } from '@/types';
import { EmptyState } from '@/components/ui/Cards';

export function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={IconWifiOff}
      title="You appear to be offline"
      description="This page could not reach the server. It will load once the connection is back."
      actionLabel="Try again"
      onAction={onRetry}
    />
  );
}

/** Every route on this surface needs somewhere to land when the load fails. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <EmptyState
      icon={IconAlertTriangle}
      title={
        missing ? 'This application is no longer available' : 'Could not load this application'
      }
      description={
        missing
          ? 'It may have been withdrawn, or the link you followed is out of date. Ask the recruiter for a current link.'
          : 'The server did not return this record. This is usually temporary.'
      }
      actionLabel="Try again"
      onAction={onRetry}
    />
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
