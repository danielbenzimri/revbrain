/**
 * Unit tests for use-tasks hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useTasks,
  useTask,
  useTasksKanban,
  useTaskSummary,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useChangeTaskStatus,
  type Task,
  type TaskStatus,
} from './use-tasks';
import * as authHeaders from '@/lib/auth-headers';

// Mock auth headers
vi.mock('@/lib/auth-headers', () => ({
  getAuthHeaders: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockTask: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  projectId: 'project-123',
  title: 'Test Task',
  description: 'Test description',
  status: 'todo',
  priority: 'medium',
  assigneeId: null,
  dueDate: null,
  tags: [],
  sortOrder: 0,
  taskNumber: 1,
  createdBy: 'user-123',
  createdAt: '2026-02-15T00:00:00Z',
  updatedAt: '2026-02-15T00:00:00Z',
  completedAt: null,
};

const mockKanbanData: Record<TaskStatus, Task[]> = {
  todo: [mockTask],
  in_progress: [],
  review: [],
  done: [],
};

describe('use-tasks hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authHeaders.getAuthHeaders).mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useTasks', () => {
    it('should fetch tasks for a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockTask],
          pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
        }),
      });

      const { result } = renderHook(() => useTasks('project-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.tasks).toHaveLength(1);
      expect(result.current.data?.tasks[0].id).toBe('task-123');
    });

    it('should not fetch when projectId is undefined', () => {
      const { result } = renderHook(() => useTasks(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => useTasks('project-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Failed to fetch tasks');
    });
  });

  describe('useTask', () => {
    it('should fetch a single task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockTask }),
      });

      const { result } = renderHook(() => useTask('task-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.title).toBe('Test Task');
    });

    it('should not fetch when id is undefined', () => {
      const { result } = renderHook(() => useTask(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useTasksKanban', () => {
    it('should fetch kanban data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockKanbanData }),
      });

      const { result } = renderHook(() => useTasksKanban('project-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.todo).toHaveLength(1);
      expect(result.current.data?.in_progress).toHaveLength(0);
    });
  });

  describe('useTaskSummary', () => {
    it('should fetch task summary', async () => {
      const mockSummary = {
        total: 5,
        byStatus: { todo: 2, in_progress: 1, review: 1, done: 1 },
        byPriority: { low: 1, medium: 2, high: 1, critical: 1 },
        overdue: 0,
        completedThisWeek: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSummary }),
      });

      const { result } = renderHook(() => useTaskSummary('project-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.total).toBe(5);
    });
  });

  describe('useCreateTask', () => {
    it('should create a task successfully', async () => {
      const newTask = { ...mockTask, id: 'new-task-123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newTask }),
      });

      const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          projectId: 'project-123',
          title: 'New Task',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/tasks'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ projectId: 'project-123', title: 'New Task' }),
        })
      );
    });

    it('should handle create error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Title is required' } }),
      });

      const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({ projectId: 'project-123', title: '' });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Title is required');
    });
  });

  describe('useUpdateTask', () => {
    it('should update a task successfully', async () => {
      const updatedTask = { ...mockTask, title: 'Updated Title' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedTask }),
      });

      const { result } = renderHook(() => useUpdateTask(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          id: 'task-123',
          projectId: 'project-123',
          data: { title: 'Updated Title' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/tasks/task-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ title: 'Updated Title' }),
        })
      );
    });
  });

  describe('useDeleteTask', () => {
    it('should delete a task successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteTask(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          id: 'task-123',
          projectId: 'project-123',
          reason: 'No longer needed',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/tasks/task-123'),
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ reason: 'No longer needed', signatureUrl: undefined }),
        })
      );
    });
  });

  describe('useChangeTaskStatus', () => {
    it('should change task status successfully', async () => {
      const updatedTask = { ...mockTask, status: 'in_progress' as TaskStatus };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedTask }),
      });

      const { result } = renderHook(() => useChangeTaskStatus(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          id: 'task-123',
          projectId: 'project-123',
          status: 'in_progress',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/tasks/task-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'in_progress' }),
        })
      );
    });

    it('should handle status change error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Cannot change status' } }),
      });

      const { result } = renderHook(() => useChangeTaskStatus(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          id: 'task-123',
          projectId: 'project-123',
          status: 'done',
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Cannot change status');
    });
  });
});
