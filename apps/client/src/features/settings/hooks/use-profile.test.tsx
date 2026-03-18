/**
 * Unit tests for useProfile hooks
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfile, useUpdateProfile, useChangePassword, useDeleteAccount } from './use-profile';
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

const mockProfile = {
  id: 'user-123',
  email: 'test@example.com',
  fullName: 'Test User',
  phoneNumber: '+1234567890',
  mobileNumber: null,
  jobTitle: 'Developer',
  address: null,
  bio: null,
  avatarUrl: null,
  age: null,
  role: 'admin',
};

describe('useProfile hooks', () => {
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

  describe('useProfile', () => {
    it('should fetch user profile successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockProfile }),
      });

      const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProfile);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/me'),
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Failed to fetch profile');
    });
  });

  describe('useUpdateProfile', () => {
    it('should update profile successfully', async () => {
      const updatedProfile = { ...mockProfile, fullName: 'Updated Name' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedProfile }),
      });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

      result.current.mutate({ fullName: 'Updated Name' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/me'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ fullName: 'Updated Name' }),
        })
      );
    });

    it('should handle update error with message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Invalid full name' } }),
      });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

      result.current.mutate({ fullName: '' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Invalid full name');
    });

    it('should handle update error without message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });

      result.current.mutate({ fullName: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Failed to update profile');
    });
  });

  describe('useChangePassword', () => {
    it('should change password successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

      result.current.mutate('NewSecureP@ss123!');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/me/change-password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ newPassword: 'NewSecureP@ss123!' }),
        })
      );
    });

    it('should handle password change error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Password too weak' } }),
      });

      const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

      result.current.mutate('weak');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Password too weak');
    });
  });

  describe('useDeleteAccount', () => {
    it('should delete account successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/me'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should handle delete error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Cannot delete org admin' } }),
      });

      const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Cannot delete org admin');
    });
  });
});
