import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireAdminPermission, clearPermissionCache } from './admin-permissions.ts';

describe('requireAdminPermission middleware', () => {
  beforeEach(() => {
    clearPermissionCache();
  });

  function createTestApp() {
    const app = new Hono();
    // Error handler to convert thrown AppErrors to JSON responses
    app.onError((err, c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any).statusCode || 500;
      return c.json({ error: { message: err.message } }, status);
    });
    return app;
  }

  it('allows system_admin with wildcard (backward compat)', async () => {
    const app = createTestApp();
    app.use('*', async (c, next) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).set('user', { id: 'test-user', role: 'system_admin' });
      return next();
    });
    app.get('/test', requireAdminPermission('users:read'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('rejects when no user is set', async () => {
    const app = createTestApp();
    app.get('/test', requireAdminPermission('users:read'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin user without assignments', async () => {
    const app = createTestApp();
    app.use('*', async (c, next) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).set('user', { id: 'test-user', role: 'operator' });
      return next();
    });
    app.get('/test', requireAdminPermission('users:read'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
  });
});
