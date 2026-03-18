/**
 * Body Limit Middleware Tests
 *
 * Tests for request body size limiting to prevent DoS attacks.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { AppError } from '@geometrix/contract';

type AnyJson = any;
import {
  apiBodyLimit,
  webhookBodyLimit,
  fileUploadBodyLimit,
  createBodyLimit,
  BODY_LIMITS,
} from './body-limit.ts';

/**
 * Create a test app with body limit middleware
 */
function createTestApp(middleware: ReturnType<typeof createBodyLimit>) {
  const app = new Hono();

  // Add error handler
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

  // Apply body limit middleware
  app.use('*', middleware);

  // Test endpoint that echoes body
  app.post('/test', async (c) => {
    const body = await c.req.text();
    return c.json({ size: body.length });
  });

  return app;
}

describe('Body Limit Middleware', () => {
  describe('BODY_LIMITS constants', () => {
    it('should have correct default sizes', () => {
      expect(BODY_LIMITS.JSON_API).toBe(100 * 1024); // 100KB
      expect(BODY_LIMITS.WEBHOOK).toBe(64 * 1024); // 64KB
      expect(BODY_LIMITS.FILE_UPLOAD).toBe(50 * 1024 * 1024); // 50MB
    });
  });

  describe('apiBodyLimit (100KB)', () => {
    it('should allow requests under the limit', async () => {
      const app = createTestApp(apiBodyLimit);
      const smallBody = 'x'.repeat(50 * 1024); // 50KB

      const res = await app.request('/test', {
        method: 'POST',
        body: smallBody,
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as AnyJson;
      expect(json.size).toBe(50 * 1024);
    });

    it('should allow requests at exactly the limit', async () => {
      const app = createTestApp(apiBodyLimit);
      const exactBody = 'x'.repeat(100 * 1024); // 100KB

      const res = await app.request('/test', {
        method: 'POST',
        body: exactBody,
      });

      expect(res.status).toBe(200);
    });

    it('should reject requests over the limit with 413', async () => {
      const app = createTestApp(apiBodyLimit);
      const largeBody = 'x'.repeat(101 * 1024); // 101KB

      const res = await app.request('/test', {
        method: 'POST',
        body: largeBody,
      });

      expect(res.status).toBe(413);
      const json = (await res.json()) as AnyJson;
      expect(json.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(json.error.message).toBe('Request body too large');
    });
  });

  describe('webhookBodyLimit (64KB)', () => {
    it('should allow webhook-sized payloads', async () => {
      const app = createTestApp(webhookBodyLimit);
      const webhookBody = 'x'.repeat(32 * 1024); // 32KB - typical webhook

      const res = await app.request('/test', {
        method: 'POST',
        body: webhookBody,
      });

      expect(res.status).toBe(200);
    });

    it('should reject payloads over 64KB', async () => {
      const app = createTestApp(webhookBodyLimit);
      const largeBody = 'x'.repeat(65 * 1024); // 65KB

      const res = await app.request('/test', {
        method: 'POST',
        body: largeBody,
      });

      expect(res.status).toBe(413);
    });
  });

  describe('fileUploadBodyLimit (50MB)', () => {
    it('should allow larger file uploads', async () => {
      const app = createTestApp(fileUploadBodyLimit);
      const fileBody = 'x'.repeat(5 * 1024 * 1024); // 5MB

      const res = await app.request('/test', {
        method: 'POST',
        body: fileBody,
      });

      expect(res.status).toBe(200);
    });

    it('should reject files over 50MB', async () => {
      const app = createTestApp(fileUploadBodyLimit);
      const hugeBody = 'x'.repeat(51 * 1024 * 1024); // 51MB

      const res = await app.request('/test', {
        method: 'POST',
        body: hugeBody,
      });

      expect(res.status).toBe(413);
    });
  });

  describe('createBodyLimit (custom)', () => {
    it('should create middleware with custom size', async () => {
      const customLimit = createBodyLimit(1024); // 1KB
      const app = createTestApp(customLimit);

      // Under limit
      const smallRes = await app.request('/test', {
        method: 'POST',
        body: 'x'.repeat(500),
      });
      expect(smallRes.status).toBe(200);

      // Over limit
      const largeRes = await app.request('/test', {
        method: 'POST',
        body: 'x'.repeat(2000),
      });
      expect(largeRes.status).toBe(413);
    });
  });

  describe('GET requests (no body)', () => {
    it('should not affect GET requests', async () => {
      const app = new Hono();
      app.use('*', apiBodyLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });
  });
});
