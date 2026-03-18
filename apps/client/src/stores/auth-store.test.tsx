/**
 * Unit tests for auth-store
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuthStore, useUser, useIsAuthenticated } from './auth-store';

// Mock the services module
const mockGetSession = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('@/lib/services', () => ({
  getAuthAdapter: () => ({
    getSession: mockGetSession,
    getCurrentUser: mockGetCurrentUser,
    login: mockLogin,
    logout: mockLogout,
    onAuthStateChange: mockOnAuthStateChange,
  }),
}));

vi.mock('@/lib/mock-data', () => ({
  MOCK_USERS: {
    admin: {
      id: 'mock-admin',
      name: 'Mock Admin',
      email: 'admin@mock.com',
      role: 'admin',
    },
    reviewer: {
      id: 'mock-reviewer',
      name: 'Mock Reviewer',
      email: 'reviewer@mock.com',
      role: 'reviewer',
    },
  },
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      user: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should start with null user', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.user).toBeNull();
    });

    it('should start with no error', () => {
      const { result } = renderHook(() => useAuthStore());
      expect(result.current.error).toBeNull();
    });
  });

  describe('login', () => {
    it('should set isLoading to true during login', async () => {
      mockLogin.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.login('test@example.com', 'password');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should clear error before login', async () => {
      useAuthStore.setState({ error: 'Previous error' });
      mockLogin.mockResolvedValue({});

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password');
      });

      expect(result.current.error).toBeNull();
    });

    it('should set error on login failure', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'wrong-password');
      });

      expect(result.current.error).toBe('Invalid credentials');
      expect(result.current.isLoading).toBe(false);
    });

    it('should call adapter login with credentials', async () => {
      mockLogin.mockResolvedValue({});

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  describe('logout', () => {
    it('should call adapter logout', async () => {
      mockLogout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockLogout).toHaveBeenCalled();
    });

    it('should handle logout error gracefully', async () => {
      mockLogout.mockRejectedValue(new Error('Logout failed'));

      const { result } = renderHook(() => useAuthStore());

      // Should not throw
      await act(async () => {
        await result.current.logout();
      });

      // Error should be cleared on logout error
      expect(result.current.error).toBeNull();
    });
  });

  describe('simulateRole', () => {
    it('should set user to mock user for valid role', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.simulateRole('admin');
      });

      expect(result.current.user).toEqual({
        id: 'mock-admin',
        name: 'Mock Admin',
        email: 'admin@mock.com',
        role: 'admin',
      });
    });

    it('should set user to inspector mock', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.simulateRole('reviewer');
      });

      expect(result.current.user?.role).toBe('reviewer');
    });

    it('should not change user for invalid role', () => {
      const { result } = renderHook(() => useAuthStore());
      const originalUser = result.current.user;

      act(() => {
        // Test with a role that doesn't exist in MOCK_USERS
        result.current.simulateRole('system_admin');
      });

      // system_admin is not in our mock MOCK_USERS, so user should remain unchanged
      expect(result.current.user).toBe(originalUser);
    });
  });

  describe('clearError', () => {
    it('should clear the error state', () => {
      useAuthStore.setState({ error: 'Some error' });

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set loading state when initializing', async () => {
      mockGetSession.mockResolvedValue(null);
      mockOnAuthStateChange.mockReturnValue(() => {});

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.initialize();
      });

      // Initially loading should be true
      expect(result.current.isLoading).toBe(true);
    });

    it('should set user to null when no session', async () => {
      mockGetSession.mockResolvedValue(null);
      mockOnAuthStateChange.mockReturnValue(() => {});

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.initialize();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });

    it('should return cleanup function', () => {
      mockGetSession.mockResolvedValue(null);
      const mockCleanup = vi.fn();
      mockOnAuthStateChange.mockReturnValue(mockCleanup);

      const { result } = renderHook(() => useAuthStore());

      let cleanup: (() => void) | undefined;
      act(() => {
        cleanup = result.current.initialize();
      });

      expect(typeof cleanup).toBe('function');
    });
  });
});

describe('selector hooks', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isLoading: false,
      error: null,
    });
  });

  describe('useUser', () => {
    it('should return null when no user', () => {
      const { result } = renderHook(() => useUser());
      expect(result.current).toBeNull();
    });

    it('should return user when logged in', () => {
      const mockUser = {
        id: '1',
        name: 'Test',
        email: 'test@test.com',
        role: 'admin' as const,
      };
      useAuthStore.setState({ user: mockUser });

      const { result } = renderHook(() => useUser());
      expect(result.current).toEqual(mockUser);
    });
  });

  describe('useIsAuthenticated', () => {
    it('should return false when no user', () => {
      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(false);
    });

    it('should return true when user exists', () => {
      useAuthStore.setState({
        user: { id: '1', name: 'Test', email: 'test@test.com', role: 'admin' },
      });

      const { result } = renderHook(() => useIsAuthenticated());
      expect(result.current).toBe(true);
    });
  });
});
