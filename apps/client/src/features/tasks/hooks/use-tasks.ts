/**
 * Tasks Hooks
 *
 * React Query hooks for task/Kanban management:
 * - Task CRUD operations
 * - Status changes
 * - Kanban board data
 * - Audit log
 * - Summary & export
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  tags: string[];
  sortOrder: number;
  taskNumber: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
  sortOrder?: number;
}

export interface TaskAuditLogEntry {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string | null;
  taskTitle: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  userId: string;
  userName: string;
  details: string | null;
  reason: string | null;
  signatureUrl: string | null;
  previousStatus: TaskStatus | null;
  newStatus: TaskStatus | null;
  createdAt: string;
}

export interface TaskSummary {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: number;
  completedThisWeek: number;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const taskKeys = {
  all: ['tasks'] as const,
  project: (projectId: string) => [...taskKeys.all, 'project', projectId] as const,
  list: (projectId: string, page: number, status?: TaskStatus) =>
    [...taskKeys.project(projectId), 'list', page, status ?? 'all'] as const,
  kanban: (projectId: string) => [...taskKeys.project(projectId), 'kanban'] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  summary: (projectId: string) => [...taskKeys.project(projectId), 'summary'] as const,
  auditLog: (projectId: string) => [...taskKeys.project(projectId), 'audit'] as const,
  assigned: () => [...taskKeys.all, 'assigned'] as const,
};

// ============================================================================
// TASK QUERIES
// ============================================================================

/**
 * Get tasks for a project with pagination and optional status filter
 */
export function useTasks(
  projectId: string | undefined,
  options?: { limit?: number; offset?: number; status?: TaskStatus }
) {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const status = options?.status;

  return useQuery({
    queryKey: taskKeys.list(projectId || '', Math.floor(offset / limit), status),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      let url = `${apiUrl}/v1/tasks/project/${projectId}?limit=${limit}&offset=${offset}`;
      if (status) {
        url += `&status=${status}`;
      }
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const result = await response.json();
      return {
        tasks: result.data as Task[],
        pagination: result.pagination as PaginationInfo,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Get tasks grouped by status for Kanban board
 */
export function useTasksKanban(projectId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.kanban(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/project/${projectId}/kanban`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch kanban data');
      }

      const result = await response.json();
      return result.data as Record<TaskStatus, Task[]>;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Get a single task by ID
 * Uses placeholderData from kanban/list cache for instant rendering
 */
export function useTask(id: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: taskKeys.detail(id || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/${id}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch task');
      }

      const result = await response.json();
      return result.data as Task;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    placeholderData: () => {
      // Search kanban and list caches for the task
      const queries = queryClient.getQueryCache().findAll({ queryKey: taskKeys.all });
      for (const query of queries) {
        const data = query.state.data;
        // Check kanban format: Record<TaskStatus, Task[]>
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          for (const tasks of Object.values(data as Record<string, Task[]>)) {
            if (Array.isArray(tasks)) {
              const found = tasks.find((t) => t.id === id);
              if (found) return found;
            }
          }
        }
        // Check list format: { tasks: Task[] }
        const listData = data as { tasks?: Task[] } | undefined;
        const found = listData?.tasks?.find((t) => t.id === id);
        if (found) return found;
      }
      return undefined;
    },
  });
}

/**
 * Get tasks assigned to current user
 */
export function useAssignedTasks(options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  return useQuery({
    queryKey: taskKeys.assigned(),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/assigned?limit=${limit}&offset=${offset}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch assigned tasks');
      }

      const result = await response.json();
      return result.data as Task[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Get project task summary
 */
export function useTaskSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.summary(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/project/${projectId}/summary`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch task summary');
      }

      const result = await response.json();
      return result.data as TaskSummary;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get task audit log for a project
 */
export function useTaskAuditLog(projectId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.auditLog(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/project/${projectId}/audit`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit log');
      }

      const result = await response.json();
      return result.data as TaskAuditLogEntry[];
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// TASK MUTATIONS
// ============================================================================

/**
 * Create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create task');
      }

      const result = await response.json();
      return result.data as Task;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.project(task.projectId) });
    },
  });
}

/**
 * Update a task
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      data,
    }: {
      id: string;
      projectId: string;
      data: UpdateTaskInput;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update task');
      }

      const result = await response.json();
      return { task: result.data as Task, projectId };
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
      const previousDetail = queryClient.getQueryData(taskKeys.detail(id));

      queryClient.setQueryData(taskKeys.detail(id), (old: Task | undefined) => {
        if (!old) return old;
        return { ...old, ...data, updatedAt: new Date().toISOString() };
      });

      return { previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(taskKeys.detail(id), context.previousDetail);
      }
    },
    onSettled: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: taskKeys.project(result.projectId) });
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(result.task.id) });
      }
    },
  });
}

/**
 * Change task status (quick action for Kanban)
 * Uses PUT instead of PATCH for broader CORS compatibility
 * Implements optimistic updates for smooth drag-and-drop UX
 */
export function useChangeTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      status,
    }: {
      id: string;
      projectId: string;
      status: TaskStatus;
    }) => {
      const headers = await getAuthHeaders();
      // Use PUT endpoint instead of PATCH for CORS compatibility
      const response = await fetch(`${apiUrl}/v1/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to change status');
      }

      const result = await response.json();
      return { task: result.data as Task, projectId };
    },
    // Optimistic update for smooth drag-and-drop
    onMutate: async ({ id, projectId, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: taskKeys.kanban(projectId) });

      // Snapshot previous value
      const previousKanban = queryClient.getQueryData<Record<TaskStatus, Task[]>>(
        taskKeys.kanban(projectId)
      );

      // Optimistically update the kanban board
      if (previousKanban) {
        const newKanban = { ...previousKanban };
        let movedTask: Task | undefined;

        // Find and remove task from its current column
        for (const columnStatus of Object.keys(newKanban) as TaskStatus[]) {
          const taskIndex = newKanban[columnStatus].findIndex((t) => t.id === id);
          if (taskIndex !== -1) {
            movedTask = { ...newKanban[columnStatus][taskIndex], status };
            newKanban[columnStatus] = newKanban[columnStatus].filter((t) => t.id !== id);
            break;
          }
        }

        // Add task to new column
        if (movedTask) {
          newKanban[status] = [...newKanban[status], movedTask];
        }

        queryClient.setQueryData(taskKeys.kanban(projectId), newKanban);
      }

      return { previousKanban, projectId };
    },
    // Revert on error
    onError: (_err, { projectId }, context) => {
      if (context?.previousKanban) {
        queryClient.setQueryData(taskKeys.kanban(projectId), context.previousKanban);
      }
    },
    // Refetch after success or error to ensure consistency
    onSettled: (_data, _error, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.kanban(projectId) });
    },
  });
}

/**
 * Delete a task
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      reason,
      signatureUrl,
    }: {
      id: string;
      projectId: string;
      reason?: string;
      signatureUrl?: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/${id}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ reason, signatureUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete task');
      }

      return { id, projectId };
    },
    onMutate: async ({ id, projectId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.kanban(projectId) });
      const previousKanban = queryClient.getQueryData(taskKeys.kanban(projectId));

      queryClient.setQueryData(
        taskKeys.kanban(projectId),
        (old: Record<TaskStatus, Task[]> | undefined) => {
          if (!old) return old;
          const updated = { ...old };
          for (const status of Object.keys(updated) as TaskStatus[]) {
            updated[status] = updated[status].filter((t) => t.id !== id);
          }
          return updated;
        }
      );

      return { previousKanban };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previousKanban) {
        queryClient.setQueryData(taskKeys.kanban(projectId), context.previousKanban);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.project(variables.projectId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.auditLog(variables.projectId) });
    },
  });
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export task audit log to Excel
 */
export function useExportTaskAuditLog() {
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/tasks/project/${projectId}/audit/export`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to export audit log');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-audit-${projectId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    },
  });
}
