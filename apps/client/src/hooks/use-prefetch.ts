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
import { boqKeys, type BOQItem } from '@/features/boq/hooks/use-boq';
import {
  billKeys,
  type Bill,
  type PaginationInfo,
} from '@/features/execution/hooks/use-execution-bills';
import { taskKeys, type Task } from '@/features/tasks/hooks/use-tasks';

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
          if (!response.ok) return null; // Silently fail
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
 * Returns a callback that prefetches all project workspace data on hover.
 * Simultaneously prefetches BOQ, bills, and tasks for the project.
 */
export function usePrefetchProjectWorkspace() {
  const queryClient = useQueryClient();

  return useCallback(
    (projectId: string) => {
      // Prefetch BOQ items (silently return empty if endpoint unavailable)
      queryClient.prefetchQuery({
        queryKey: boqKeys.flat(projectId),
        queryFn: async () => {
          const headers = await getAuthHeaders();
          const response = await fetch(`${apiUrl}/v1/boq/project/${projectId}`, { headers });
          if (!response.ok) return { items: [] as BOQItem[], count: 0 };
          const result = await response.json();
          return { items: result.data as BOQItem[], count: result.meta?.count || 0 };
        },
        staleTime: 30 * 1000,
      });

      // Prefetch execution bills (silently return empty if endpoint unavailable)
      queryClient.prefetchQuery({
        queryKey: billKeys.list(projectId, 0),
        queryFn: async () => {
          const headers = await getAuthHeaders();
          const response = await fetch(
            `${apiUrl}/v1/execution/bills/project/${projectId}?limit=20&offset=0`,
            { headers }
          );
          if (!response.ok) return { bills: [] as Bill[], pagination: {} as PaginationInfo };
          const result = await response.json();
          return {
            bills: result.data as Bill[],
            pagination: result.pagination as PaginationInfo,
          };
        },
        staleTime: 30 * 1000,
      });

      // Prefetch tasks (silently return empty if endpoint unavailable)
      queryClient.prefetchQuery({
        queryKey: taskKeys.kanban(projectId),
        queryFn: async () => {
          const headers = await getAuthHeaders();
          const response = await fetch(`${apiUrl}/v1/tasks/project/${projectId}/kanban`, {
            headers,
          });
          if (!response.ok) return {} as Record<string, Task[]>;
          const result = await response.json();
          return result.data as Record<string, Task[]>;
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}
