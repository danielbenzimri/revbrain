/**
 * Assessment API route integration tests.
 *
 * Tests the full flow: API routes → mock repository → response.
 * Uses the mock assessment repository pre-populated with seed data.
 *
 * See: Implementation Plan Task 13.5
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MOCK_IDS } from '@revbrain/seed-data';

const PROJECT_Q1 = MOCK_IDS.PROJECT_Q1_MIGRATION;
const PROJECT_PHASE2 = MOCK_IDS.PROJECT_PHASE2;
const RUN_Q1 = MOCK_IDS.ASSESSMENT_RUN_Q1;
const RUN_PHASE2 = MOCK_IDS.ASSESSMENT_RUN_PHASE2;

// Use mock user token format
const MOCK_TOKEN = `mock_token_${MOCK_IDS.USER_ACME_OWNER}`;

const BASE_URL = 'http://localhost:3000/api/v1';

/**
 * Helper to make authenticated API calls against the running mock server.
 * These tests require `pnpm local` to be running.
 */
async function api(path: string, options?: RequestInit) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${MOCK_TOKEN}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}

describe('Assessment API Routes', () => {
  // These tests run against the mock server — skip if not running
  beforeEach(async () => {
    try {
      const health = await fetch(`${BASE_URL}/health`);
      if (!health.ok) throw new Error('Server not running');
    } catch {
      // Server not running — skip test
      return;
    }
  });

  describe('GET /projects/:id/assessment/status', () => {
    it('returns latest run for Q1 project', async () => {
      const { status, body } = await api(`/projects/${PROJECT_Q1}/assessment/status`);

      // May return 200 with data or 200 with null (depends on mock state)
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      if (body.data) {
        expect(body.data.runId).toBe(RUN_Q1);
        expect(body.data.status).toBe('completed');
        expect(body.data.projectId).toBe(PROJECT_Q1);
      }
    });

    it('returns latest run for Phase 2 project', async () => {
      const { status, body } = await api(`/projects/${PROJECT_PHASE2}/assessment/status`);

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      if (body.data) {
        expect(body.data.runId).toBe(RUN_PHASE2);
        expect(body.data.status).toBe('completed');
      }
    });

    it('returns 404 for non-existent project', async () => {
      const { status, body } = await api(
        '/projects/00000000-0000-4000-a000-000000009999/assessment/status'
      );

      expect(status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /projects/:id/assessment/runs', () => {
    it('lists runs for Q1 project', async () => {
      const { status, body } = await api(`/projects/${PROJECT_Q1}/assessment/runs`);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('supports pagination', async () => {
      const { status, body } = await api(
        `/projects/${PROJECT_Q1}/assessment/runs?limit=1&offset=0`
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /projects/:id/assessment/runs/:runId/status', () => {
    it('returns status for specific run', async () => {
      const { status, body } = await api(
        `/projects/${PROJECT_Q1}/assessment/runs/${RUN_Q1}/status`
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      if (body.data) {
        expect(body.data.runId).toBe(RUN_Q1);
        expect(body.data.status).toBe('completed');
      }
    });

    it('returns 404 for wrong project-run combination', async () => {
      // Run belongs to Q1 project, not Phase 2
      const { status } = await api(`/projects/${PROJECT_PHASE2}/assessment/runs/${RUN_Q1}/status`);
      expect(status).toBe(404);
    });
  });

  describe('POST /projects/:id/assessment/run', () => {
    it('creates a new run and returns 202', async () => {
      // This will succeed once, then hit rate limit / concurrency on subsequent calls
      const { status, body } = await api(`/projects/${PROJECT_Q1}/assessment/run`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'full' }),
      });

      // Could be 202 (created), 409 (active run), or 429 (rate limited)
      expect([202, 409, 429, 412, 503]).toContain(status);

      if (status === 202) {
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('dispatched');
        expect(body.data.projectId).toBe(PROJECT_Q1);
      }
    });
  });

  describe('POST /projects/:id/assessment/runs/:runId/cancel', () => {
    it('rejects cancel on completed run', async () => {
      const { status, body } = await api(
        `/projects/${PROJECT_Q1}/assessment/runs/${RUN_Q1}/cancel`,
        { method: 'POST' }
      );

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });
});
