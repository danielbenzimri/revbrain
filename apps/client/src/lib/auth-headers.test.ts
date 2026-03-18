import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthenticationError,
  getAuthHeaders,
  authFetch,
  invalidateAuthCache,
} from './auth-headers';

// Mock the services module
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();
const mockLogout = vi.fn();

vi.mock('@/lib/services', () => ({
  getAuthAdapter: () => ({
    getSession: mockGetSession,
    refreshSession: mockRefreshSession,
    logout: mockLogout,
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AuthenticationError', () => {
  it('should create error with default message', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Not authenticated');
    expect(error.name).toBe('AuthenticationError');
  });

  it('should create error with custom message', () => {
    const error = new AuthenticationError('Custom message');
    expect(error.message).toBe('Custom message');
  });

  it('should be instanceof Error', () => {
    const error = new AuthenticationError();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('getAuthHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAuthCache();
  });

  it('should return Bearer token for valid session', async () => {
    mockGetSession.mockResolvedValue({
      accessToken: 'valid-token-123',
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 min from now
    });

    const headers = await getAuthHeaders();
    expect(headers).toEqual({
      Authorization: 'Bearer valid-token-123',
      'Content-Type': 'application/json',
    });
  });

  it('should refresh token when expired', async () => {
    const refreshedSession = {
      accessToken: 'refreshed-token',
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    mockGetSession
      .mockResolvedValueOnce({
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000, // Already expired
      })
      .mockResolvedValueOnce(refreshedSession); // After refresh, adapter returns new session
    mockRefreshSession.mockResolvedValue(refreshedSession);

    const headers = await getAuthHeaders();
    expect(mockRefreshSession).toHaveBeenCalled();
    expect(headers).toEqual({
      Authorization: 'Bearer refreshed-token',
      'Content-Type': 'application/json',
    });
  });

  it('should refresh token when about to expire (within 5 min buffer)', async () => {
    const refreshedSession = {
      accessToken: 'refreshed-token',
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    mockGetSession
      .mockResolvedValueOnce({
        accessToken: 'soon-expired-token',
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 min from now (within 5 min buffer)
      })
      .mockResolvedValueOnce(refreshedSession); // After refresh
    mockRefreshSession.mockResolvedValue(refreshedSession);

    await getAuthHeaders();
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('should NOT refresh token when more than 5 min remaining', async () => {
    mockGetSession.mockResolvedValue({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min from now
    });

    await getAuthHeaders();
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('should throw AuthenticationError when no session and refresh fails', async () => {
    mockGetSession.mockResolvedValue(null);
    mockRefreshSession.mockRejectedValue(new Error('Refresh failed'));

    await expect(getAuthHeaders()).rejects.toThrow('Session expired');
    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('should throw when session has no accessToken', async () => {
    const emptySession = { accessToken: null, expiresAt: 0 };
    mockGetSession.mockResolvedValueOnce(emptySession).mockResolvedValueOnce(emptySession); // Still empty after refresh
    mockRefreshSession.mockResolvedValue(emptySession);

    await expect(getAuthHeaders()).rejects.toThrow('No valid session');
  });
});

describe('authFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAuthCache();
    mockGetSession.mockResolvedValue({
      accessToken: 'test-token',
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
  });

  it('should call fetch with auth headers', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    await authFetch('https://api.example.com/data');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should merge custom headers with auth headers', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    await authFetch('https://api.example.com/data', {
      headers: { 'X-Custom': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-Custom': 'value',
        }),
      })
    );
  });

  it('should throw AuthenticationError on 401 response', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    mockLogout.mockResolvedValue(undefined);

    await expect(authFetch('https://api.example.com/data')).rejects.toThrow(AuthenticationError);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should swallow logout errors on 401', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    mockLogout.mockRejectedValue(new Error('Logout failed'));

    // Should still throw AuthenticationError, not the logout error
    await expect(authFetch('https://api.example.com/data')).rejects.toThrow('Session invalid');
  });

  it('should return response for non-401 status codes', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

    const response = await authFetch('https://api.example.com/data');
    expect(response.status).toBe(200);
  });

  it('should pass through 404 without triggering logout', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

    const response = await authFetch('https://api.example.com/data');
    expect(response.status).toBe(404);
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
