/**
 * Auth Middleware Security Tests
 *
 * Tests the critical security behavior of the authentication middleware.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

type AnyJson = any;

// Mock environment and dependencies
const mockGetEnv = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../lib/env.ts', () => ({
  getEnv: mockGetEnv,
}));

vi.mock('../lib/logger.ts', () => ({
  logger: mockLogger,
}));

// Mock database - not used in mock rejection tests
vi.mock('@geometrix/database', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
  users: { id: 'id' },
  organizations: { id: 'id' },
  eq: vi.fn((...args) => ({ type: 'eq', args })),
}));

// Import after mocks
import { authMiddleware } from './auth.ts';
import { AppError } from '@geometrix/contract';

// Helper to create app with error handling
function createTestApp() {
  const app = new Hono();

  // Error handler to convert AppError to proper response
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 401);
    }
    return c.json({ error: { message: err.message } }, 500);
  });

  app.use('*', authMiddleware);
  app.get('/', (c) => c.json({ ok: true }));

  return app;
}

describe('Auth Middleware Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Mock Token Rejection', () => {
    it('should reject mock tokens in production environment', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const app = createTestApp();

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer mock_token_attacker123',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as AnyJson;
      expect(body.error.message).toContain('Mock tokens are only allowed in development');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Mock token rejected in non-development environment',
        expect.objectContaining({ env: 'production' })
      );
    });

    it('should reject mock tokens in staging environment', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'staging';
        return undefined;
      });

      const app = createTestApp();

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer mock_token_attacker123',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as AnyJson;
      expect(body.error.message).toContain('Mock tokens are only allowed in development');
    });

    it('should reject mock tokens when NODE_ENV is undefined (production default)', async () => {
      mockGetEnv.mockImplementation((_key: string) => undefined);

      const app = createTestApp();

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer mock_token_attacker123',
        },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as AnyJson;
      expect(body.error.message).toContain('Mock tokens are only allowed in development');
    });

    it('should reject mock tokens even if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      // This was the previous vulnerability - if Supabase key was missing, mock worked
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return undefined; // Missing!
        return undefined;
      });

      const app = createTestApp();

      const res = await app.request('/', {
        headers: {
          Authorization: 'Bearer mock_token_attacker123',
        },
      });

      // Should still reject - this is the critical security fix
      expect(res.status).toBe(401);
    });

    it('should NOT log sensitive parts of the mock token', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      const app = createTestApp();

      await app.request('/', {
        headers: {
          Authorization: 'Bearer mock_token_sensitive_user_id_12345',
        },
      });

      // Should only log first 15 chars of token, not the full user ID
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Mock token rejected in non-development environment',
        expect.objectContaining({
          tokenPrefix: 'mock_token_sens', // Only 15 chars
        })
      );
    });
  });

  describe('Missing Authorization Header', () => {
    it('should reject requests without Authorization header', async () => {
      mockGetEnv.mockImplementation((_key: string) => 'production');

      const app = createTestApp();

      const res = await app.request('/');

      expect(res.status).toBe(401);
      const body = (await res.json()) as AnyJson;
      expect(body.error.message).toContain('Missing or invalid Authorization header');
    });

    it('should reject requests with malformed Authorization header', async () => {
      mockGetEnv.mockImplementation((_key: string) => 'production');

      const app = createTestApp();

      const res = await app.request('/', {
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz', // Basic auth, not Bearer
        },
      });

      expect(res.status).toBe(401);
    });
  });
});
