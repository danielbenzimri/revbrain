/**
 * Prefetch Helper Hooks
 *
 * Provides prefetch utilities for key data transitions,
 * enabling instant navigation by pre-fetching data on hover.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAuthHeaders } from '@/lib/auth-headers';
import { projectKeys, type ProjectEntity } from '@/features/projects/hooks/use-project-api';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

/**
 * Returns a callback that prefetches a project's detail data on hover.
 * Data stays fresh for 30 seconds to avoid redundant refetches.
 */
export function usePrefetchProject() {
  const queryClient = useQueryClient();

  return useCallback(
    (projectId: string) => {
      queryClient.prefetchQuery({
        queryKey: projectKeys.detail(projectId),
        queryFn: async () => {
          const headers = await getAuthHeaders();
          const response = await fetch(`${apiUrl}/v1/projects/${projectId}`, { headers });
          if (!response.ok) return null;
          const result = await response.json();
          return result.data as ProjectEntity;
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Returns a callback that prefetches project workspace data on hover.
 */
export function usePrefetchProjectWorkspace() {
  const prefetchProject = usePrefetchProject();

  return useCallback(
    (projectId: string) => {
      prefetchProject(projectId);
    },
    [prefetchProject]
  );
}
