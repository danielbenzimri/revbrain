/**
 * Request Timeout Middleware Tests
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { AppError } from '@revbrain/contract';

type AnyJson = any;
import { createTimeoutMiddleware, TIMEOUTS } from './timeout.ts';

function createTestApp(timeoutMs: number) {
  const app = new Hono();

  // Error handler
  app.onError((err, c) => {
    if (err instanceof AppError || (err as any).code) {
      const appErr = err as AppError;
      return c.json(
        { error: { code: appErr.code, message: appErr.message } },
        appErr.statusCode as any
      );
    }
    return c.json({ error: { message: err.message } }, 500);
  });

  app.use('*', createTimeoutMiddleware(timeoutMs));

  return app;
}

describe('Timeout Middleware', () => {
  describe('TIMEOUTS constants', () => {
    it('should have correct default timeout values', () => {
      expect(TIMEOUTS.DEFAULT).toBe(30_000);
      expect(TIMEOUTS.WEBHOOK).toBe(60_000);
      expect(TIMEOUTS.FILE_UPLOAD).toBe(120_000);
      expect(TIMEOUTS.REPORT).toBe(90_000);
    });
  });

  describe('Request completion', () => {
    it('should allow fast requests to complete', async () => {
      const app = createTestApp(1000); // 1 second timeout
      app.get('/fast', (c) => c.json({ ok: true }));

      const res = await app.request('/fast');

      expect(res.status).toBe(200);
      const json = (await res.json()) as AnyJson;
      expect(json.ok).toBe(true);
    });

    it('should allow requests that complete just before timeout', async () => {
      const app = createTestApp(500); // 500ms timeout
      app.get('/close', async (c) => {
        await new Promise((r) => setTimeout(r, 100)); // 100ms delay
        return c.json({ ok: true });
      });

      const res = await app.request('/close');

      expect(res.status).toBe(200);
    });
  });

  describe('Timeout enforcement', () => {
    it('should timeout slow requests with 503 status', async () => {
      const app = createTestApp(100); // 100ms timeout
      app.get('/slow', async (c) => {
        await new Promise((r) => setTimeout(r, 500)); // 500ms delay
        return c.json({ ok: true });
      });

      const res = await app.request('/slow');

      expect(res.status).toBe(503);
      const json = (await res.json()) as AnyJson;
      expect(json.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(json.error.message).toContain('timeout');
    });

    it('should include timeout duration in error message', async () => {
      const app = createTestApp(2000); // 2 second timeout
      app.get('/slow', async (c) => {
        await new Promise((r) => setTimeout(r, 3000)); // 3 second delay
        return c.json({ ok: true });
      });

      const res = await app.request('/slow');

      expect(res.status).toBe(503);
      const json = (await res.json()) as AnyJson;
      expect(json.error.message).toContain('2 seconds');
    });
  });

  describe('Custom timeout values', () => {
    it('should respect custom timeout duration', async () => {
      const app = createTestApp(200); // 200ms
      app.get('/test', async (c) => {
        await new Promise((r) => setTimeout(r, 150)); // Under timeout
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });
  });

  describe('POST requests', () => {
    it('should enforce timeout on POST requests', async () => {
      const app = createTestApp(100);
      app.post('/submit', async (c) => {
        await new Promise((r) => setTimeout(r, 500));
        return c.json({ ok: true });
      });

      const res = await app.request('/submit', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });

      expect(res.status).toBe(503);
    });
  });
});
