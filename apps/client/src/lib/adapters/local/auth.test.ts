import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalAuthAdapter } from './auth';
import { MOCK_USERS, DEFAULT_MOCK_USER } from '@/lib/mock-data';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('LocalAuthAdapter', () => {
  let adapter: LocalAuthAdapter;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    adapter = new LocalAuthAdapter();
  });

  describe('login', () => {
    it('should login system_admin by email', async () => {
      const result = await adapter.login('admin@revbrain.io');
      expect(result.user.role).toBe('system_admin');
      expect(result.user.email).toBe('admin@revbrain.io');
      expect(result.session.accessToken).toContain('mock_token_');
      expect(result.session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should login org_owner by email', async () => {
      const result = await adapter.login('david@acme.com');
      expect(result.user.role).toBe('org_owner');
    });

    it('should login reviewer by email', async () => {
      const result = await adapter.login('amy@client.com');
      expect(result.user.role).toBe('reviewer');
    });

    it('should fallback to operator for unknown email', async () => {
      const result = await adapter.login('unknown@example.com');
      expect(result.user.role).toBe(DEFAULT_MOCK_USER.role);
    });

    it('should persist session to localStorage', async () => {
      await adapter.login('admin@revbrain.io');
      expect(localStorage.setItem).toHaveBeenCalledWith('revbrain_session', expect.any(String));
    });

    it('should generate a 24-hour session', async () => {
      const result = await adapter.login('admin@revbrain.io');
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      // Allow 5 second tolerance for test execution time
      expect(result.session.expiresAt).toBeGreaterThan(expectedExpiry - 5000);
      expect(result.session.expiresAt).toBeLessThan(expectedExpiry + 5000);
    });
  });

  describe('logout', () => {
    it('should clear session from localStorage', async () => {
      await adapter.login('admin@revbrain.io');
      await adapter.logout();
      expect(localStorage.removeItem).toHaveBeenCalledWith('revbrain_session');
    });
  });

  describe('getSession', () => {
    it('should return session after login', async () => {
      await adapter.login('admin@revbrain.io');
      const session = await adapter.getSession();
      expect(session).not.toBeNull();
      expect(session?.accessToken).toBeDefined();
    });

    it('should return null when no session exists', async () => {
      const session = await adapter.getSession();
      expect(session).toBeNull();
    });
  });

  describe('refreshSession', () => {
    it('should refresh and extend session expiry', async () => {
      const loginResult = await adapter.login('admin@revbrain.io');
      const originalExpiry = loginResult.session.expiresAt;

      // Wait a bit then refresh
      const refreshed = await adapter.refreshSession();
      expect(refreshed).not.toBeNull();
      expect(refreshed!.expiresAt).toBeGreaterThanOrEqual(originalExpiry);
    });

    it('should return null when no session to refresh', async () => {
      const refreshed = await adapter.refreshSession();
      expect(refreshed).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user after login', async () => {
      await adapter.login('admin@revbrain.io');
      const user = await adapter.getCurrentUser();
      expect(user).not.toBeNull();
      expect(user?.email).toBe('admin@revbrain.io');
    });

    it('should return null when not logged in', async () => {
      const user = await adapter.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      await adapter.login('admin@revbrain.io');
      const updated = await adapter.updateUser({ name: 'Updated Name' });
      expect(updated.name).toBe('Updated Name');
    });

    it('should throw if not authenticated', async () => {
      await expect(adapter.updateUser({ name: 'test' })).rejects.toThrow('Not authenticated');
    });
  });

  describe('onAuthStateChange', () => {
    it('should notify on login (SIGNED_IN)', async () => {
      const callback = vi.fn();
      adapter.onAuthStateChange(callback);

      await adapter.login('admin@revbrain.io');
      expect(callback).toHaveBeenCalledWith('SIGNED_IN', expect.any(Object));
    });

    it('should notify on logout (SIGNED_OUT)', async () => {
      const callback = vi.fn();
      adapter.onAuthStateChange(callback);

      await adapter.login('admin@revbrain.io');
      await adapter.logout();
      expect(callback).toHaveBeenCalledWith('SIGNED_OUT', null);
    });

    it('should return unsubscribe function', async () => {
      const callback = vi.fn();
      const unsubscribe = adapter.onAuthStateChange(callback);

      unsubscribe();
      await adapter.login('admin@revbrain.io');
      // Should NOT be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('all mock roles are testable', () => {
    const roles = Object.keys(MOCK_USERS) as Array<keyof typeof MOCK_USERS>;

    it.each(roles)('should login as %s', async (role) => {
      const mockUser = MOCK_USERS[role];
      const result = await adapter.login(mockUser.email);
      expect(result.user.role).toBe(role);
    });
  });
});
