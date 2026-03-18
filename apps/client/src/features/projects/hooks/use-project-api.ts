/**
 * Project API Hooks
 *
 * React Query hooks for project operations via API:
 * - List projects
 * - Get single project
 * - Create/update/delete projects
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// Types
export interface ProjectEntity {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  organizationId: string;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  status?: 'active' | 'on_hold' | 'completed' | 'cancelled';
}

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

/**
 * Get all projects for current organization
 */
export function useProjectsList() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const result = await response.json();
      return {
        projects: result.data as ProjectEntity[],
        count: result.meta?.count || result.data.length,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get single project by ID
 * Uses placeholderData from the projects list cache for instant rendering
 */
export function useProject(id: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: projectKeys.detail(id || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${id}`, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Project not found');
        }
        throw new Error('Failed to fetch project');
      }

      const result = await response.json();
      return result.data as ProjectEntity;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    placeholderData: () => {
      // Pull from the list cache for instant rendering
      const listData = queryClient.getQueryData<{ projects: ProjectEntity[] }>(projectKeys.list());
      return listData?.projects?.find((p) => p.id === id);
    },
  });
}

/**
 * Create project
 */
export function useCreateProjectAPI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProjectInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create project');
      }

      const result = await response.json();
      return result.data as ProjectEntity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/**
 * Update project
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateProjectInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update project');
      }

      const result = await response.json();
      return result.data as ProjectEntity;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
    },
  });
}

/**
 * Delete project
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete project');
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
