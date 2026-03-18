/**
 * Unit tests for Health Check Routes
 *
 * Tests the health check endpoints for service monitoring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { healthRouter } from './health.ts';

type AnyJson = any;

// Hoisted mocks
const { mockGetStripe, mockGetEmailService, mockGetEnv, mockGetDB, mockClient } = vi.hoisted(
  () => ({
    mockGetStripe: vi.fn(),
    mockGetEmailService: vi.fn(),
    mockGetEnv: vi.fn(),
    mockGetDB: vi.fn(),
    mockClient: vi.fn(),
  })
);

// Mock dependencies
vi.mock('../../lib/stripe.ts', () => ({
  getStripe: mockGetStripe,
}));

vi.mock('../../emails/index.ts', () => ({
  getEmailService: mockGetEmailService,
}));

vi.mock('../../lib/env.ts', () => ({
  getEnv: mockGetEnv,
}));

vi.mock('../../lib/config.ts', () => ({
  getVersion: vi.fn(() => '1.0.0-test'),
  getRegion: vi.fn(() => 'test-region'),
  isProduction: vi.fn(() => false),
}));

vi.mock('../../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@geometrix/database', () => ({
  getDB: mockGetDB,
  client: mockClient,
  users: { id: 'id' },
}));

// Create test app
const createTestApp = () => {
  const app = new Hono();
  app.route('/health', healthRouter);
  return app;
};

describe('Health Check Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();

    // Default mock implementations
    mockGetEnv.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        NODE_ENV: 'test',
        EMAIL_ADAPTER: 'console',
      };
      return env[key];
    });

    mockGetDB.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'test-user' }]),
        }),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('ok');
      expect(body.version).toBe('1.0.0-test');
      expect(body.region).toBe('test-region');
      expect(body.env).toBe('test');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/stripe', () => {
    it('should return ok when Stripe is configured and responsive', async () => {
      const mockStripe = {
        balance: {
          retrieve: vi.fn().mockResolvedValue({ object: 'balance' }),
        },
      };
      mockGetStripe.mockReturnValue(mockStripe);

      const res = await app.request('/health/stripe');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('ok');
      expect(body.latencyMs).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('should return down when Stripe is not configured', async () => {
      mockGetStripe.mockReturnValue(null);

      const res = await app.request('/health/stripe');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('down');
      expect(body.message).toBe('Stripe not configured');
    });

    it('should return error when Stripe API fails', async () => {
      const mockStripe = {
        balance: {
          retrieve: vi.fn().mockRejectedValue(new Error('API key invalid')),
        },
      };
      mockGetStripe.mockReturnValue(mockStripe);

      const res = await app.request('/health/stripe');

      expect(res.status).toBe(500);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('error');
      expect(body.error).toContain('API key invalid');
    });
  });

  describe('GET /health/email', () => {
    it('should return ok for console adapter', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'console';
        return undefined;
      });
      mockGetEmailService.mockReturnValue({ send: vi.fn() });

      const res = await app.request('/health/email');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('ok');
      expect(body.adapter).toBe('console');
      expect(body.configured).toBe(true);
    });

    it('should return ok for resend adapter with API key', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });
      mockGetEmailService.mockReturnValue({ send: vi.fn() });

      const res = await app.request('/health/email');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('ok');
      expect(body.adapter).toBe('resend');
      expect(body.configured).toBe(true);
    });

    it('should return degraded for resend adapter without API key', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'resend';
        if (key === 'RESEND_API_KEY') return undefined;
        return undefined;
      });
      mockGetEmailService.mockReturnValue({ send: vi.fn() });

      const res = await app.request('/health/email');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('degraded');
      expect(body.adapter).toBe('resend');
      expect(body.message).toContain('not configured');
    });
  });

  describe('GET /health/full', () => {
    it('should return healthy when all dependencies are ok', async () => {
      // Mock database
      mockGetDB.mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'test' }]),
          }),
        }),
      });

      // Mock Stripe
      mockGetStripe.mockReturnValue({
        balance: {
          retrieve: vi.fn().mockResolvedValue({ object: 'balance' }),
        },
      });

      // Mock Email
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'console';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const res = await app.request('/health/full');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('healthy');
      expect(body.dependencies.database.status).toBe('ok');
      expect(body.dependencies.stripe.status).toBe('ok');
      expect(body.dependencies.email.status).toBe('ok');
      expect(body.version).toBe('1.0.0-test');
      expect(body.region).toBe('test-region');
    });

    it('should return degraded when Stripe is not configured', async () => {
      // Mock database
      mockGetDB.mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'test' }]),
          }),
        }),
      });

      // Mock Stripe not configured
      mockGetStripe.mockReturnValue(null);

      // Mock Email
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'console';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const res = await app.request('/health/full');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('degraded');
      expect(body.dependencies.database.status).toBe('ok');
      expect(body.dependencies.stripe.status).toBe('degraded');
      expect(body.dependencies.email.status).toBe('ok');
    });

    it('should return unhealthy when database is down', async () => {
      // Mock database failure
      mockGetDB.mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('Connection refused')),
          }),
        }),
      });

      // Mock Stripe
      mockGetStripe.mockReturnValue({
        balance: {
          retrieve: vi.fn().mockResolvedValue({ object: 'balance' }),
        },
      });

      // Mock Email
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'console';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const res = await app.request('/health/full');

      expect(res.status).toBe(503);

      const body = (await res.json()) as AnyJson;
      expect(body.status).toBe('unhealthy');
      expect(body.dependencies.database.status).toBe('down');
      expect(body.dependencies.database.message).toContain('Connection refused');
    });

    it('should include latency measurements', async () => {
      // Mock database
      mockGetDB.mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'test' }]),
          }),
        }),
      });

      // Mock Stripe
      mockGetStripe.mockReturnValue({
        balance: {
          retrieve: vi.fn().mockResolvedValue({ object: 'balance' }),
        },
      });

      // Mock Email
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'EMAIL_ADAPTER') return 'console';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      });

      const res = await app.request('/health/full');

      expect(res.status).toBe(200);

      const body = (await res.json()) as AnyJson;
      expect(body.dependencies.database.latencyMs).toBeDefined();
      expect(typeof body.dependencies.database.latencyMs).toBe('number');
      expect(body.dependencies.stripe.latencyMs).toBeDefined();
      expect(typeof body.dependencies.stripe.latencyMs).toBe('number');
    });
  });
});
