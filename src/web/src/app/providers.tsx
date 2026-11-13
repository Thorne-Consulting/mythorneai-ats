'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/popover';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            // A 4xx will not become a 2xx on a second try, and retrying it only
            // delays the error the user needs to see.
            retry: (failureCount: number, error: unknown) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              failureCount < 1,
            refetchOnWindowFocus: false,
            // Default 'online' pauses a retry whenever the online heuristic says
            // offline, and a paused query never becomes an error: the UI sits on a
            // loading skeleton forever. Always attempt the request and let a real
            // failure surface as a real error.
            networkMode: 'offlineFirst',
          },
        },
      }),
  );
  return (
    <>
      <TooltipProvider delayDuration={300}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TooltipProvider>
      <Toaster />
    </>
  );
}
