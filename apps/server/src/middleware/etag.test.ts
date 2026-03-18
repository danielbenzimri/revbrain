/**
 * ETag Middleware Tests
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { etagMiddleware } from './etag.ts';

function createTestApp() {
  const app = new Hono();
  app.use('*', etagMiddleware);
  return app;
}

describe('ETag Middleware', () => {
  it('should add a weak ETag header to GET 200 responses', async () => {
    const app = createTestApp();
    app.get('/data', (c) => c.json({ items: [1, 2, 3] }));

    const res = await app.request('/data');
    expect(res.status).toBe(200);
    const etag = res.headers.get('ETag');
    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^W\/"[a-z0-9]+"$/);
  });

  it('should return 304 when If-None-Match matches', async () => {
    const app = createTestApp();
    app.get('/data', (c) => c.json({ items: [1, 2, 3] }));

    // First request to get the ETag
    const res1 = await app.request('/data');
    const etag = res1.headers.get('ETag')!;
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const res2 = await app.request('/data', {
      headers: { 'If-None-Match': etag },
    });
    expect(res2.status).toBe(304);
    const body = await res2.text();
    expect(body).toBe('');
  });

  it('should return 200 with new ETag when If-None-Match does not match', async () => {
    const app = createTestApp();
    app.get('/data', (c) => c.json({ items: [1, 2, 3] }));

    const res = await app.request('/data', {
      headers: { 'If-None-Match': 'W/"stale-hash"' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeTruthy();
    const data = await res.json();
    expect(data).toEqual({ items: [1, 2, 3] });
  });

  it('should not affect POST requests', async () => {
    const app = createTestApp();
    app.post('/data', (c) => c.json({ created: true }));

    const res = await app.request('/data', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeNull();
  });

  it('should not affect non-200 responses', async () => {
    const app = createTestApp();
    app.get('/not-found', (c) => c.json({ error: 'not found' }, 404));

    const res = await app.request('/not-found');
    expect(res.status).toBe(404);
    expect(res.headers.get('ETag')).toBeNull();
  });

  it('should handle large response bodies without issues', async () => {
    const app = createTestApp();
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(),
    }));
    app.get('/large', (c) => c.json(largeArray));

    const res = await app.request('/large');
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeTruthy();
    expect(res.headers.get('ETag')).toMatch(/^W\/"[a-z0-9]+"$/);
  });

  it('should produce same ETag for same body on different URLs', async () => {
    const app = createTestApp();
    const data = { value: 'constant' };
    app.get('/path-a', (c) => c.json(data));
    app.get('/path-b', (c) => c.json(data));

    const resA = await app.request('/path-a');
    const resB = await app.request('/path-b');
    expect(resA.headers.get('ETag')).toBe(resB.headers.get('ETag'));
  });
});
