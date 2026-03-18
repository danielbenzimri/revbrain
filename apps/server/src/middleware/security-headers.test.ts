/**
 * Security Headers Middleware Tests
 *
 * Verifies that security headers are correctly applied
 * and that production detection uses NODE_ENV, not Host header.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock isProduction before importing the middleware
const mockIsProduction = vi.hoisted(() => vi.fn());

vi.mock('../lib/config.ts', () => ({
  isProduction: mockIsProduction,
}));

// Import after mocks
import { securityHeadersMiddleware } from './security-headers.ts';

function createTestApp() {
  const app = new Hono();
  app.use('*', securityHeadersMiddleware);
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('Security Headers Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Standard Security Headers', () => {
    it('should set X-Content-Type-Options header', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-XSS-Protection header', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should set Permissions-Policy header', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    });

    it('should set Cache-Control headers', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private');
      expect(res.headers.get('Pragma')).toBe('no-cache');
    });
  });

  describe('HSTS Header (Production Detection)', () => {
    it('should set HSTS header in production', async () => {
      mockIsProduction.mockReturnValue(true);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains'
      );
    });

    it('should NOT set HSTS header in development', async () => {
      mockIsProduction.mockReturnValue(false);
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('should use NODE_ENV for production detection, NOT Host header', async () => {
      // CRITICAL SECURITY TEST: Attacker sends Host: localhost to try to bypass HSTS
      mockIsProduction.mockReturnValue(true); // NODE_ENV says production
      const app = createTestApp();

      // Attacker sends localhost Host header
      const res = await app.request('/test', {
        headers: {
          Host: 'localhost:3000', // Attacker tries to spoof as localhost
        },
      });

      // HSTS should STILL be set because we use NODE_ENV, not Host header
      expect(res.headers.get('Strict-Transport-Security')).toBe(
        'max-age=31536000; includeSubDomains'
      );
      expect(mockIsProduction).toHaveBeenCalled();
    });

    it('should NOT set HSTS even with production Host header if NODE_ENV is development', async () => {
      mockIsProduction.mockReturnValue(false); // NODE_ENV says development
      const app = createTestApp();

      // Request with production-looking Host header
      const res = await app.request('/test', {
        headers: {
          Host: 'api.revbrain.com', // Looks like production
        },
      });

      // HSTS should NOT be set because NODE_ENV is development
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });
  });
});
