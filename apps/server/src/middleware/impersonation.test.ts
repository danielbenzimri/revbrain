import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { impersonationMiddleware } from './impersonation.ts';

describe('impersonationMiddleware', () => {
  /**
   * Create a test app with the impersonation middleware.
   * Injects a mock jwtPayload via a preceding middleware (simulating auth).
   */
  function createApp(jwtPayload?: Record<string, unknown>) {
    const app = new Hono();

    // Simulate auth middleware setting jwtPayload
    app.use('*', async (c, next) => {
      if (jwtPayload) {
        c.set('jwtPayload', jwtPayload);
      }
      return next();
    });

    // Impersonation middleware under test
    app.use('*', impersonationMiddleware);

    // Test routes
    app.get('/v1/projects/123', (c) => c.json({ ok: true }));
    app.get('/api/v1/projects/456', (c) => c.json({ ok: true }));
    app.post('/v1/projects/123', (c) => c.json({ created: true }));
    app.get('/v1/billing/usage', (c) => c.json({ ok: true }));
    app.get('/v1/billing/subscription', (c) => c.json({ ok: true }));
    app.post('/v1/billing/portal', (c) => c.json({ ok: true }));
    app.get('/v1/org/users', (c) => c.json({ ok: true }));
    app.get('/v1/users/me', (c) => c.json({ ok: true }));
    app.post('/v1/chat/send', (c) => c.json({ sent: true }));
    app.delete('/v1/projects/123', (c) => c.json({ deleted: true }));
    app.get('/v1/admin/stats', (c) => c.json({ stats: true }));
    app.post('/v1/admin/impersonate', (c) => c.json({ ok: true }));
    app.post('/v1/admin/end-impersonation', (c) => c.json({ ok: true }));

    return app;
  }

  const impersonationPayload = {
    sub: 'target-supabase-id',
    realUserId: 'admin-user-id',
    realSubject: 'admin-supabase-id',
    impersonationMode: 'read_only',
    reason: 'Testing support ticket #123',
    iss: 'revbrain-impersonation',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 1800,
  };

  // ========================================================================
  // Non-impersonation tokens pass through unchanged
  // ========================================================================

  it('passes through when no jwtPayload is set', async () => {
    const app = createApp();
    const res = await app.request('/v1/projects/123');
    expect(res.status).toBe(200);
  });

  it('passes through for normal (non-impersonation) JWT', async () => {
    const app = createApp({
      sub: 'some-user',
      iss: 'supabase',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await app.request('/v1/projects/123');
    expect(res.status).toBe(200);
  });

  it('passes through for JWT with no iss claim', async () => {
    const app = createApp({ sub: 'some-user' });
    const res = await app.request('/v1/projects/123');
    expect(res.status).toBe(200);
  });

  // ========================================================================
  // Impersonation token allows GET requests on allowlisted paths
  // ========================================================================

  it('allows GET /v1/projects/* during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/projects/123');
    expect(res.status).toBe(200);
  });

  it('allows GET /api/v1/projects/* during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/api/v1/projects/456');
    expect(res.status).toBe(200);
  });

  it('allows GET /v1/billing/usage during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/billing/usage');
    expect(res.status).toBe(200);
  });

  it('allows GET /v1/billing/subscription during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/billing/subscription');
    expect(res.status).toBe(200);
  });

  it('allows POST /v1/billing/portal during impersonation (read-like)', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/billing/portal', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows GET /v1/org/users during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/org/users');
    expect(res.status).toBe(200);
  });

  it('allows GET /v1/users/* during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/users/me');
    expect(res.status).toBe(200);
  });

  // ========================================================================
  // Impersonation token blocks non-allowlisted mutations
  // ========================================================================

  it('blocks POST /v1/projects/* during impersonation (not on allowlist)', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/projects/123', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('impersonation_read_only');
  });

  it('blocks POST /v1/chat/send during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/chat/send', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('impersonation_read_only');
  });

  it('blocks DELETE /v1/projects/* during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/projects/123', { method: 'DELETE' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('impersonation_read_only');
  });

  // ========================================================================
  // Admin routes remain accessible during impersonation
  // ========================================================================

  it('allows GET /v1/admin/* during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/admin/stats');
    expect(res.status).toBe(200);
  });

  it('allows POST /v1/admin/impersonate during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/admin/impersonate', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows POST /v1/admin/end-impersonation during impersonation', async () => {
    const app = createApp(impersonationPayload);
    const res = await app.request('/v1/admin/end-impersonation', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
