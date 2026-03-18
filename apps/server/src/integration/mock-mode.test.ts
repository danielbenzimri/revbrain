/**
 * Mock Mode Integration Tests
 *
 * Verifies the complete server flow in mock mode:
 * startup → auth → repository → response
 *
 * Uses Hono's app.request() for in-process testing (fast, no child process).
 * Requires USE_MOCK_DATA=true and AUTH_MODE=mock env vars.
 */
import { describe, it, expect } from 'vitest';
import { MOCK_IDS } from '../mocks/constants.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

// Set mock mode env vars before importing app
process.env.USE_MOCK_DATA = 'true';
process.env.AUTH_MODE = 'mock';
process.env.APP_ENV = 'local';

// Dynamic import to ensure env vars are set before app initializes
const { default: app } = await import('../index.ts');

function mockAuthHeader(userId: string) {
  return { Authorization: `Bearer mock_token_${userId}` };
}

describe('Mock mode integration', () => {
  it('health endpoint works', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyJson;
    expect(body.status).toBe('ok');
  });

  it('default auth (no header) returns Acme org_owner data', async () => {
    const res = await app.request('/v1/projects');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyJson;
    expect(body.success).toBe(true);
    // Acme org_owner should see all 4 Acme projects
    expect(body.data).toHaveLength(4);
  });

  it('specific user auth returns correct data', async () => {
    const res = await app.request('/v1/projects', {
      headers: mockAuthHeader(MOCK_IDS.USER_ACME_ADMIN),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyJson;
    expect(body.success).toBe(true);
    // Admin should also see all 4 Acme projects
    expect(body.data).toHaveLength(4);
  });

  it('Beta org_owner sees zero projects (tenant isolation)', async () => {
    const res = await app.request('/v1/projects', {
      headers: mockAuthHeader(MOCK_IDS.USER_BETA_OWNER),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyJson;
    expect(body.data).toHaveLength(0);
  });

  it('invalid mock token returns 401', async () => {
    const res = await app.request('/v1/projects', {
      headers: { Authorization: 'Bearer mock_token_nonexistent-id' },
    });
    expect(res.status).toBe(401);
  });

  it('malformed auth header returns 401', async () => {
    const res = await app.request('/v1/projects', {
      headers: { Authorization: 'Bearer invalid_format_token' },
    });
    expect(res.status).toBe(401);
  });

  it('project detail endpoint returns single project', async () => {
    const res = await app.request(`/v1/projects/${MOCK_IDS.PROJECT_Q1_MIGRATION}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnyJson;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_IDS.PROJECT_Q1_MIGRATION);
  });

  it('nonexistent project returns 404', async () => {
    const res = await app.request('/v1/projects/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('no DATABASE_URL needed in mock mode', () => {
    // If we got here without DATABASE_URL, DB was never touched
    expect(process.env.DATABASE_URL).toBeUndefined();
  });
});
