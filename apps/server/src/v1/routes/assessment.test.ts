/**
 * Assessment API route integration tests.
 *
 * Tests the full flow: API routes → mock repository → response.
 * Uses Hono's app.request() for in-process testing (no running server needed).
 *
 * See: Implementation Plan Task 13.5
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { MOCK_IDS } from '@revbrain/seed-data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

const PROJECT_Q1 = MOCK_IDS.PROJECT_Q1_MIGRATION;
const PROJECT_PHASE2 = MOCK_IDS.PROJECT_PHASE2;
const RUN_Q1 = MOCK_IDS.ASSESSMENT_RUN_Q1;

// Set mock mode env vars before importing app
process.env.USE_MOCK_DATA = 'true';
process.env.AUTH_MODE = 'mock';
process.env.APP_ENV = 'local';

// Dynamic import to ensure env vars are set before app initializes
const { default: app } = await import('../../index.ts');

const MOCK_TOKEN = `mock_token_${MOCK_IDS.USER_ACME_OWNER}`;

function authHeaders() {
  return {
    Authorization: `Bearer ${MOCK_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

describe('Assessment API Routes', () => {
  describe('GET /projects/:id/assessment/status', () => {
    it('returns latest run for Q1 project', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_Q1}/assessment/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      if (body.data) {
        expect(body.data.runId).toBe(RUN_Q1);
        expect(body.data.status).toBe('completed');
        expect(body.data.projectId).toBe(PROJECT_Q1);
        // PH8.5 — IR node count surface is wired (null until BB-3 runs).
        expect(body.data).toHaveProperty('irNodeCount');
        expect(body.data.irNodeCount).toBeNull();
      }
    });

    it('returns latest run for Phase 2 project', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_PHASE2}/assessment/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await app.request(
        '/v1/projects/00000000-0000-4000-a000-000000009999/assessment/status',
        { headers: authHeaders() }
      );
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /projects/:id/assessment/runs', () => {
    it('lists runs for Q1 project', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_Q1}/assessment/runs`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('supports pagination', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_Q1}/assessment/runs?limit=1&offset=0`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /projects/:id/assessment/runs/:runId/status', () => {
    it('returns status for specific run', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_Q1}/assessment/runs/${RUN_Q1}/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      if (body.data) {
        expect(body.data.runId).toBe(RUN_Q1);
        expect(body.data.status).toBe('completed');
        // PH8.5 — per-run status endpoint also surfaces irNodeCount.
        expect(body.data).toHaveProperty('irNodeCount');
      }
    });

    it('returns 404 for wrong project-run combination', async () => {
      const res = await app.request(
        `/v1/projects/${PROJECT_PHASE2}/assessment/runs/${RUN_Q1}/status`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:id/assessment/run', () => {
    it('validates project access before creating run', async () => {
      const res = await app.request(
        '/v1/projects/00000000-0000-4000-a000-000000009999/assessment/run',
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ mode: 'full' }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects/:id/assessment/runs/:runId/cancel', () => {
    it('rejects cancel on completed run', async () => {
      const res = await app.request(`/v1/projects/${PROJECT_Q1}/assessment/runs/${RUN_Q1}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const body = (await res.json()) as AnyJson;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });
});
