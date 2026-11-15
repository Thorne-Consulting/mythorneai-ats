'use client';

import Link from 'next/link';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/api';
import { Button, Card, EmptyState } from '@/components/ui';
import type { ApplicationDetailResponse } from '@/types';
import type { ApplicationData } from './application-types';

export function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={WifiOff}
        title="You seem to be offline"
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
  // A deleted or forbidden application will not come back, so offer a way out instead of a retry.
  if (error instanceof ApiError && error.status === 404)
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="This application is no longer available"
          description="It may have been deleted, or you no longer have access to its job."
          action={
            <Button asChild variant="secondary">
              <Link href="/candidates">Back to candidates</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Could not load this application"
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

export function useApplication(id: string, initialData?: ApplicationDetailResponse) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<ApplicationData>(`/api/applications/${id}`),
    // The server render fetched the same endpoint, so it has every field ApplicationData names.
    initialData: initialData as ApplicationData | undefined,
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
