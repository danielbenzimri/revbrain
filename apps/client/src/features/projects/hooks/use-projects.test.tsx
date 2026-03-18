/**
 * Unit tests for use-projects hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjects, useCreateProject, type Project } from './use-projects';

// Use vi.hoisted to define mocks before they're used in vi.mock
const { mockQuery, mockInsert } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('@/hooks/use-services', () => ({
  useDB: () => ({
    query: mockQuery,
    insert: mockInsert,
  }),
}));

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

const mockProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Building A',
    status: 'active',
    progress: 45,
    budget: 1000000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  },
  {
    id: 'project-2',
    name: 'Building B',
    status: 'on_hold',
    progress: 20,
    budget: 500000,
    startDate: '2026-03-01',
    endDate: '2026-09-30',
  },
  {
    id: 'project-3',
    name: 'Building C',
    status: 'completed',
    progress: 100,
    budget: 750000,
    startDate: '2025-06-01',
    endDate: '2025-12-31',
  },
];

describe('use-projects hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useProjects', () => {
    it('should fetch projects successfully', async () => {
      mockQuery.mockResolvedValueOnce(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.[0].name).toBe('Building A');
      expect(mockQuery).toHaveBeenCalledWith('projects');
    });

    it('should handle empty projects list', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(0);
    });

    it('should handle query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Database error');
    });
  });

  describe('useCreateProject', () => {
    it('should create a project successfully', async () => {
      const newProject: Omit<Project, 'id'> = {
        name: 'New Building',
        status: 'active',
        progress: 0,
        budget: 800000,
        startDate: '2026-04-01',
        endDate: '2027-03-31',
      };

      const createdProject = { ...newProject, id: 'project-new' };
      mockInsert.mockResolvedValueOnce(createdProject);

      const { result } = renderHook(() => useCreateProject(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate(newProject);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockInsert).toHaveBeenCalledWith('projects', newProject);
    });

    it('should handle create error', async () => {
      mockInsert.mockRejectedValueOnce(new Error('Insert failed'));

      const { result } = renderHook(() => useCreateProject(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.mutate({
          name: 'Test',
          status: 'active',
          progress: 0,
          budget: 100000,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Insert failed');
    });
  });
});
