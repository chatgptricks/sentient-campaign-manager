import { useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Toaster } from 'sonner';

import { AuthProvider } from '../features/auth/AuthProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: (failureCount, error) => {
              if (error instanceof Error && /forbidden|unauthorized|session/i.test(error.message))
                return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={350}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#121512',
              border: '1px solid rgba(255,255,255,.14)',
              color: '#f5f5ef',
            },
          }}
        />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
