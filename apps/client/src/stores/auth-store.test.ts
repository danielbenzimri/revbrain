/**
 * Auth Store Tests — DB role is the source of truth
 *
 * Verifies that the auth store fetches the user profile from the API
 * and uses the DB role (not Supabase user_metadata.role) for authorization.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must set env before imports
vi.stubEnv('VITE_AUTH_MODE', 'jwt');
vi.stubEnv('VITE_API_URL', 'http://localhost:3000');

// Mock the auth adapter
const mockGetSession = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockOnAuthStateChange = vi.fn().mockReturnValue(() => {});

vi.mock('@/lib/services', () => ({
  getAuthAdapter: () => ({
    getSession: mockGetSession,
    getCurrentUser: mockGetCurrentUser,
    onAuthStateChange: mockOnAuthStateChange,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/auth-headers', () => ({
  invalidateAuthCache: vi.fn(),
}));

vi.mock('@/lib/mock-data', () => ({
  MOCK_USERS: {},
}));

vi.mock('@/lib/adapters/local/auth', () => ({
  simulateRole: vi.fn(),
}));

// Mock global fetch for the DB profile call
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import store after mocks are set
import { useAuthStore } from './auth-store';

describe('Auth Store — DB role source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset store state
    useAuthStore.setState({ user: null, isLoading: true, error: null });
  });

  it('uses DB role when user_metadata has a different role', async () => {
    // Supabase Auth returns role: 'user' (from user_metadata)
    mockGetSession.mockResolvedValue({
      accessToken: 'test-token',
      expiresAt: Date.now() + 3600000,
    });
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-123',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'user', // <-- user_metadata.role (wrong)
      avatar: null,
    });

    // DB API returns the real role
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'user-123',
            email: 'admin@test.com',
            fullName: 'Test Admin',
            role: 'system_admin', // <-- DB role (correct)
            avatarUrl: null,
          },
        }),
    });

    const cleanup = useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      const user = useAuthStore.getState().user;
      expect(user).not.toBeNull();
    });

    const user = useAuthStore.getState().user;
    expect(user?.role).toBe('system_admin'); // DB role wins
    expect(user?.email).toBe('admin@test.com');

    // Verify fetch was called with users/me endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/users/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );

    cleanup();
  });

  it('falls back to auth adapter role when API is unreachable', async () => {
    mockGetSession.mockResolvedValue({
      accessToken: 'test-token',
      expiresAt: Date.now() + 3600000,
    });
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-456',
      email: 'fallback@test.com',
      name: 'Fallback User',
      role: 'org_owner',
      avatar: null,
    });

    // API call fails
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const cleanup = useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      const user = useAuthStore.getState().user;
      expect(user).not.toBeNull();
    });

    const user = useAuthStore.getState().user;
    expect(user?.role).toBe('org_owner'); // Falls back to auth adapter

    cleanup();
  });

  it('uses DB name and avatar over auth adapter values', async () => {
    mockGetSession.mockResolvedValue({
      accessToken: 'test-token',
      expiresAt: Date.now() + 3600000,
    });
    mockGetCurrentUser.mockResolvedValue({
      id: 'user-789',
      email: 'name@test.com',
      name: 'Auth Name',
      role: 'admin',
      avatar: null,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'user-789',
            email: 'name@test.com',
            fullName: 'DB Full Name',
            role: 'admin',
            avatarUrl: 'https://example.com/avatar.jpg',
          },
        }),
    });

    const cleanup = useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      const user = useAuthStore.getState().user;
      expect(user).not.toBeNull();
    });

    const user = useAuthStore.getState().user;
    expect(user?.name).toBe('DB Full Name');
    expect(user?.avatar).toBe('https://example.com/avatar.jpg');

    cleanup();
  });
});
