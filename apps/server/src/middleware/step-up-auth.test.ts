import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireRecentAuth } from './step-up-auth.ts';

describe('requireRecentAuth middleware', () => {
  function createApp(maxAgeMinutes: number, iat?: number) {
    const app = new Hono();

    // Mock JWT payload
    app.use('*', async (c, next) => {
      if (iat !== undefined) {
        c.set('jwtPayload', { iat, sub: 'test-user' });
      }
      return next();
    });

    app.get('/test', requireRecentAuth(maxAgeMinutes), (c) => {
      return c.json({ ok: true });
    });

    return app;
  }

  it('allows recent auth (2 min ago with 5 min limit)', async () => {
    const iat = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
    const app = createApp(5, iat);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('blocks old auth (10 min ago with 5 min limit)', async () => {
    const origAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'jwt';
    const iat = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const app = createApp(5, iat);
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    process.env.AUTH_MODE = origAuthMode;
  });

  it('allows when no iat claim exists', async () => {
    const app = createApp(5); // no iat
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('allows with exact boundary (4 min ago with 5 min limit)', async () => {
    const iat = Math.floor(Date.now() / 1000) - 240; // 4 minutes ago
    const app = createApp(5, iat);
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('blocks at boundary (6 min ago with 5 min limit)', async () => {
    const origAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'jwt';
    const iat = Math.floor(Date.now() / 1000) - 360; // 6 minutes ago
    const app = createApp(5, iat);
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    process.env.AUTH_MODE = origAuthMode;
  });

  it('skips in mock auth mode', async () => {
    const origAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'mock';

    const iat = Math.floor(Date.now() / 1000) - 9999; // very old
    const app = createApp(5, iat);
    const res = await app.request('/test');
    expect(res.status).toBe(200);

    process.env.AUTH_MODE = origAuthMode;
  });
});
