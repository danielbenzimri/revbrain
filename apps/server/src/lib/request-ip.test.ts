/**
 * Request IP Extraction Tests
 *
 * Verifies that IP extraction follows correct priority order:
 * 1. CF-Connecting-IP (Cloudflare - most trusted)
 * 2. X-Real-IP (nginx/load balancer)
 * 3. X-Forwarded-For (first IP - can be spoofed)
 * 4. 'unknown' fallback
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { getClientIp, getClientIpOrNull } from './request-ip.ts';

type AnyJson = any;

function createTestApp() {
  const app = new Hono();
  app.get('/ip', (c) => c.json({ ip: getClientIp(c) }));
  app.get('/ip-or-null', (c) => c.json({ ip: getClientIpOrNull(c) }));
  return app;
}

describe('getClientIp', () => {
  describe('Priority Order', () => {
    it('should prefer CF-Connecting-IP over all other headers', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'CF-Connecting-IP': '1.1.1.1',
          'X-Real-IP': '2.2.2.2',
          'X-Forwarded-For': '3.3.3.3, 4.4.4.4',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('1.1.1.1');
    });

    it('should use X-Real-IP when CF-Connecting-IP is absent', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'X-Real-IP': '2.2.2.2',
          'X-Forwarded-For': '3.3.3.3, 4.4.4.4',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('2.2.2.2');
    });

    it('should use first IP from X-Forwarded-For when others are absent', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'X-Forwarded-For': '3.3.3.3, 4.4.4.4, 5.5.5.5',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('3.3.3.3');
    });

    it('should return "unknown" when no IP headers are present', async () => {
      const app = createTestApp();

      const res = await app.request('/ip');

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('unknown');
    });
  });

  describe('Edge Cases', () => {
    it('should trim whitespace from CF-Connecting-IP', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'CF-Connecting-IP': '  1.1.1.1  ',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('1.1.1.1');
    });

    it('should trim whitespace from X-Real-IP', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'X-Real-IP': '  2.2.2.2  ',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('2.2.2.2');
    });

    it('should trim whitespace from X-Forwarded-For entries', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'X-Forwarded-For': '  3.3.3.3  , 4.4.4.4',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('3.3.3.3');
    });

    it('should handle single IP in X-Forwarded-For', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'X-Forwarded-For': '3.3.3.3',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('3.3.3.3');
    });

    it('should handle IPv6 addresses', async () => {
      const app = createTestApp();

      const res = await app.request('/ip', {
        headers: {
          'CF-Connecting-IP': '2001:db8::1',
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('2001:db8::1');
    });
  });

  describe('Security: Spoofing Prevention', () => {
    it('should ignore spoofed X-Forwarded-For when CF-Connecting-IP is present', async () => {
      const app = createTestApp();

      // Attacker sends fake X-Forwarded-For, but we're behind Cloudflare
      const res = await app.request('/ip', {
        headers: {
          'CF-Connecting-IP': '1.1.1.1', // Real IP from Cloudflare
          'X-Forwarded-For': '10.0.0.1, 192.168.1.1', // Attacker's spoofed IPs
        },
      });

      const json = (await res.json()) as AnyJson;
      expect(json.ip).toBe('1.1.1.1'); // Should use Cloudflare's trusted header
    });
  });
});

describe('getClientIpOrNull', () => {
  it('should return IP when available', async () => {
    const app = createTestApp();

    const res = await app.request('/ip-or-null', {
      headers: {
        'CF-Connecting-IP': '1.1.1.1',
      },
    });

    const json = (await res.json()) as AnyJson;
    expect(json.ip).toBe('1.1.1.1');
  });

  it('should return null when no IP is available (not "unknown")', async () => {
    const app = createTestApp();

    const res = await app.request('/ip-or-null');

    const json = (await res.json()) as AnyJson;
    expect(json.ip).toBeNull();
  });
});
