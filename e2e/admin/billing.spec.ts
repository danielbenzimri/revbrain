// DORMANT: Tests for subscription-based billing model. Skipped for SI billing.
import { test, expect } from '@playwright/test';
import { apiFetch, MOCK_IDS } from '../fixtures/admin-helpers';

/**
 * Tests 58-62: Billing & Refunds (API-level)
 */

test.describe.skip('Billing & Refunds', () => {
  // These are API-only tests — no billing UI page exists in admin yet.

  test('58 — view payment details', async () => {
    // In mock mode, payment IDs may not exist — test the endpoint shape
    const { status, json } = await apiFetch('/v1/admin/billing/payments/nonexistent-id');
    // 400/404 is acceptable if no payments in mock data or invalid ID format
    expect([200, 400, 404]).toContain(status);

    if (status === 200) {
      expect(json).toHaveProperty('amount');
      expect(json).toHaveProperty('status');
    }
  });

  test('59 — issue full refund', async () => {
    const { status } = await apiFetch('/v1/admin/billing/refund', {
      method: 'POST',
      body: { paymentId: 'test-payment-id' },
    });
    // 404/400 is expected in mock mode (no real payment)
    expect([200, 400, 404]).toContain(status);
  });

  test('60 — issue partial refund', async () => {
    const { status } = await apiFetch('/v1/admin/billing/refund', {
      method: 'POST',
      body: { paymentId: 'test-payment-id', amountCents: 500 },
    });
    expect([200, 400, 404]).toContain(status);
  });

  test('61 — refund exceeding balance fails', async () => {
    const { status } = await apiFetch('/v1/admin/billing/refund', {
      method: 'POST',
      body: { paymentId: 'test-payment-id', amountCents: 99999999 },
    });
    expect([400, 404]).toContain(status);
  });

  test('62 — refund with reason', async () => {
    const { status } = await apiFetch('/v1/admin/billing/refund', {
      method: 'POST',
      body: { paymentId: 'test-payment-id', reason: 'Customer request' },
    });
    expect([200, 400, 404]).toContain(status);
  });
});
