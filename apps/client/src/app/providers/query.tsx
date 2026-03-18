import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

/**
 * Query cache configuration optimized for data freshness vs network load:
 * - Static data (plans, org structure): 30 minutes
 * - User-generated data (tasks, BOQ): 2 minutes
 * - Real-time data: 10 seconds (configured per-hook)
 *
 * Default staleTime is 2 minutes for user-generated content.
 * Override in individual hooks for static or real-time data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes - balanced for user-generated data
      gcTime: 10 * 60 * 1000, // 10 minutes cache survival (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes('4')) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: false, // Disable aggressive refetch on tab switch
      refetchOnReconnect: true, // Refetch when network reconnects
    },
    mutations: {
      onError: (error) => {
        // Global error handling for mutations
        console.error('Mutation failed:', error);
      },
    },
  },
});

export const QueryProvider = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
    {/* Only show devtools in dev mode */}
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
