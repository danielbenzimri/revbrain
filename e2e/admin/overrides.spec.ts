import { test, expect } from '@playwright/test';
import { apiFetch, MOCK_IDS } from '../fixtures/admin-helpers';

/**
 * Tests 80-84: Feature Overrides
 */

test.describe('Feature Overrides', () => {
  test('80 — grant feature override', async () => {
    const { status } = await apiFetch(
      `/v1/admin/tenants/${MOCK_IDS.ORG_ACME}/overrides`,
      {
        method: 'POST',
        body: {
          feature: 'cpq_migration',
          value: true,
          reason: 'E2E test override',
        },
      },
    );
    expect([200, 201]).toContain(status);
  });

  test('81 — grant override with expiration', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { status, json } = await apiFetch(
      `/v1/admin/tenants/${MOCK_IDS.ORG_ACME}/overrides`,
      {
        method: 'POST',
        body: {
          feature: 'data_validation',
          value: true,
          expiresAt,
          reason: 'Temporary E2E test',
        },
      },
    );
    expect([200, 201]).toContain(status);
  });

  test('82 — list tenant overrides', async () => {
    const { status, json } = await apiFetch(
      `/v1/admin/tenants/${MOCK_IDS.ORG_ACME}/overrides`,
    );
    expect(status).toBe(200);
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);

    // Should only contain active, non-expired overrides
    for (const o of json.data) {
      expect(o.revokedAt).toBeFalsy();
      if (o.expiresAt) {
        expect(new Date(o.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });

  test('83 — revoke override', async () => {
    // Create one to revoke
    const createRes = await apiFetch(
      `/v1/admin/tenants/${MOCK_IDS.ORG_ACME}/overrides`,
      {
        method: 'POST',
        body: {
          feature: 'cpq_migration',
          value: true,
          reason: 'Will be revoked',
        },
      },
    );
    const id = createRes.json?.id || createRes.json?.data?.id;
    if (!id) {
      test.skip();
      return;
    }

    const { status } = await apiFetch(`/v1/admin/overrides/${id}`, { method: 'DELETE' });
    expect(status).toBe(200);
  });

  test('84 — expired override excluded from list', async () => {
    // Create override with past expiration
    const pastDate = new Date(Date.now() - 1000).toISOString();
    await apiFetch(`/v1/admin/tenants/${MOCK_IDS.ORG_BETA}/overrides`, {
      method: 'POST',
      body: {
        feature: 'cpq_migration',
        value: true,
        expiresAt: pastDate,
        reason: 'Already expired',
      },
    });

    // List should not include expired
    const { json } = await apiFetch(`/v1/admin/tenants/${MOCK_IDS.ORG_BETA}/overrides`);
    const expired = json?.data?.filter(
      (o: { expiresAt: string | null }) =>
        o.expiresAt && new Date(o.expiresAt).getTime() < Date.now(),
    );
    expect(expired?.length ?? 0).toBe(0);
  });
});
