import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalAuthAdapter } from './adapters/local/auth';
import { RemoteAuthAdapter } from './adapters/remote/auth';
import { LocalAPIAdapter } from './adapters/local/api';
import { RemoteAPIAdapter } from './adapters/remote/api';

// Mock LocalStorage for LocalAuthAdapter
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Validation Matrix
describe('Service Layer Verification (Matrix Test)', () => {
  describe('1. Local Mode (Offline)', () => {
    let authAdapter: LocalAuthAdapter;

    beforeEach(() => {
      localStorage.clear();
      authAdapter = new LocalAuthAdapter();
    });

    it('should successfully login mock user', async () => {
      const result = await authAdapter.login('admin@revbrain.io');
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.user.role).toBe('system_admin');
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should fallback to default user for unknown email', async () => {
      const result = await authAdapter.login('unknown@test.com');
      expect(result.user.role).toBe('org_owner'); // Default fallback
    });

    it('should persist session', async () => {
      await authAdapter.login('admin@revbrain.ai');
      const session = await authAdapter.getSession();
      expect(session).not.toBeNull();
    });
  });

  describe('2. Remote Mode (Online/Supabase)', () => {
    // Skip if no credentials
    const shouldRun = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

    it.skipIf(!shouldRun)('should initialize RemoteAuthAdapter', () => {
      const adapter = new RemoteAuthAdapter();
      expect(adapter).toBeDefined();
    });

    // We don't want to actually hit production Supabase with auth requests in a generic test
    // unless we have dedicated test credentials.
    it('should have environment variables configured', () => {
      if (shouldRun) {
        const url = import.meta.env.VITE_SUPABASE_URL;
        expect(url).toMatch(/supabase\.co|localhost|127\.0\.0\.1/);
      } else {
        console.warn('Skipping Remote tests - Missing Env Vars');
      }
    });
  });

  describe('3. API Adapters', () => {
    it('LocalAPIAdapter should exist', () => {
      const adapter = new LocalAPIAdapter();
      expect(adapter).toBeInstanceOf(LocalAPIAdapter);
    });

    it('RemoteAPIAdapter should be instantiable', () => {
      const adapter = new RemoteAPIAdapter('http://localhost:54321/functions/v1');
      expect(adapter).toBeInstanceOf(RemoteAPIAdapter);
    });
  });
});
