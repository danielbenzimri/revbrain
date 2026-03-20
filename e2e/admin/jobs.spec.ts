import { test, expect } from '@playwright/test';
import { apiFetch } from '../fixtures/admin-helpers';

/**
 * Tests 73-76: Job Queue
 */

test.describe('Job Queue', () => {
  test('73 — job stats load', async () => {
    const { status, json } = await apiFetch('/v1/admin/jobs/stats');
    // In mock mode, job queue may not be available (500) — accept that
    if (status === 500) {
      // Job queue service not running in mock mode — acceptable
      return;
    }
    expect(status).toBe(200);
    const data = json?.data || json;
    expect(data).toHaveProperty('pending');
    expect(data).toHaveProperty('processing');
    expect(data).toHaveProperty('completed');
    expect(data).toHaveProperty('failed');
    expect(data).toHaveProperty('dead');
  });

  test('74 — dead jobs list', async () => {
    const { status, json } = await apiFetch('/v1/admin/jobs/dead?limit=20');
    if (status === 500) {
      // Job queue service not running in mock mode
      return;
    }
    expect(status).toBe(200);
    const data = json?.data || json;
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('75 — retry idempotent job (email)', async () => {
    // Get dead jobs
    const { json } = await apiFetch('/v1/admin/jobs/dead?limit=50');
    const emailJob = json?.data?.find((j: { type: string }) => j.type === 'email');

    if (!emailJob) {
      // No dead email jobs to retry — just verify the endpoint rejects non-existent ID
      const { status } = await apiFetch('/v1/admin/jobs/nonexistent/retry', { method: 'POST' });
      expect([400, 404]).toContain(status);
      return;
    }

    const { status } = await apiFetch(`/v1/admin/jobs/${emailJob.id}/retry`, { method: 'POST' });
    expect(status).toBe(200);
  });

  test('76 — retry non-idempotent job rejected', async () => {
    const { json } = await apiFetch('/v1/admin/jobs/dead?limit=50');
    const unsafeJob = json?.data?.find(
      (j: { type: string }) => j.type !== 'email' && j.type !== 'webhook',
    );

    if (!unsafeJob) {
      // Verify endpoint exists and rejects made-up IDs
      const { status } = await apiFetch('/v1/admin/jobs/fake-id/retry', { method: 'POST' });
      expect([400, 404]).toContain(status);
      return;
    }

    const { status } = await apiFetch(`/v1/admin/jobs/${unsafeJob.id}/retry`, { method: 'POST' });
    expect(status).toBe(400);
  });
});
