/**
 * Unit tests for use-org-users hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOrgUsers, useTeamMembers, type OrgUser } from './use-org-users';
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

const mockUsers: OrgUser[] = [
  {
    id: 'user-1',
    email: 'admin@company.com',
    fullName: 'Admin User',
    role: 'admin',
    isOrgAdmin: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    activatedAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-02-15T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'member@company.com',
    fullName: 'Team Member',
    role: 'contractor_worker',
    isOrgAdmin: false,
    isActive: true,
    createdAt: '2026-01-15T00:00:00Z',
    activatedAt: '2026-01-15T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'user-3',
    email: 'inactive@company.com',
    fullName: 'Inactive User',
    role: 'contractor_worker',
    isOrgAdmin: false,
    isActive: false,
    createdAt: '2026-01-01T00:00:00Z',
    activatedAt: null,
    lastLoginAt: null,
  },
];

describe('use-org-users hooks', () => {
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

  describe('useOrgUsers', () => {
    it('should fetch organization users successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockUsers }),
      });

      const { result } = renderHook(() => useOrgUsers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.[0].email).toBe('admin@company.com');
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => useOrgUsers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Failed to fetch organization users');
    });

    it('should call correct API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      renderHook(() => useOrgUsers(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/v1/org/users'),
          expect.any(Object)
        );
      });
    });
  });

  describe('useTeamMembers', () => {
    it('should return only active users formatted for components', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockUsers }),
      });

      const { result } = renderHook(() => useTeamMembers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Should filter out inactive users (user-3)
      expect(result.current.data).toHaveLength(2);

      // Check format is { id, name }
      expect(result.current.data?.[0]).toEqual({
        id: 'user-1',
        name: 'Admin User',
      });
      expect(result.current.data?.[1]).toEqual({
        id: 'user-2',
        name: 'Team Member',
      });
    });

    it('should use email as fallback name when fullName is empty', async () => {
      const usersWithEmptyName: OrgUser[] = [
        {
          ...mockUsers[0],
          fullName: '',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: usersWithEmptyName }),
      });

      const { result } = renderHook(() => useTeamMembers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.[0].name).toBe('admin@company.com');
    });

    it('should return empty array when no users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const { result } = renderHook(() => useTeamMembers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });
  });
});
