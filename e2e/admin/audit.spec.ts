import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateAdmin, apiFetch, sel, MOCK_IDS } from '../fixtures/admin-helpers';

/**
 * Tests 63-72: Audit Log
 */

test.describe('Audit Log', () => {
  // -----------------------------------------------------------------------
  // 8.1 Audit Viewer (UI)
  // -----------------------------------------------------------------------

  test.describe('Audit Viewer', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('63 — audit log page loads', async ({ page }) => {
      await navigateAdmin(page, '/admin/audit');

      await expect(page.getByRole('heading', { name: /audit log|יומן ביקורת/i })).toBeVisible({
        timeout: 10_000,
      });

      // Table or empty state
      const table = page.locator('table');
      const empty = page.getByText(/no audit|לא נמצאו רשומות/i);
      await expect(table.or(empty)).toBeVisible();
    });

    test('64 — filter by action type', async ({ page }) => {
      await navigateAdmin(page, '/admin/audit');

      // The action filter is a custom dropdown (not <select>) with label "פעולה"
      const actionDropdown = page
        .locator('button, [role="combobox"]')
        .filter({ hasText: /פעולה|action/i })
        .first();
      await expect(actionDropdown).toBeVisible({ timeout: 10_000 });
      await actionDropdown.click();

      // Pick the first option from the dropdown list
      const option = page.locator('[role="option"], [role="menuitem"], li').first();
      if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
      }

      await page.waitForTimeout(500);
    });

    test('65 — filter by date range', async ({ page }) => {
      await navigateAdmin(page, '/admin/audit');

      // Date inputs show as dd/mm/yyyy — they may be type="date" or custom inputs
      const dateInputs = page.locator('input[type="date"], input[placeholder*="dd"]');
      const dateFrom = dateInputs.first();
      await expect(dateFrom).toBeVisible({ timeout: 10_000 });
      await dateFrom.fill('2025-01-01');
      await page.waitForTimeout(500);
    });

    test('66 — search audit logs', async ({ page }) => {
      await navigateAdmin(page, '/admin/audit');

      // Search placeholder: EN "Search..." / HE "חיפוש..."
      const search = page.getByPlaceholder(/search|חיפוש/i);
      await expect(search).toBeVisible({ timeout: 10_000 });
      await search.fill('user');
      await page.waitForTimeout(500);
    });

    test('67 — export CSV button visible', async ({ page }) => {
      await navigateAdmin(page, '/admin/audit');

      await expect(page.getByRole('button', { name: sel.export })).toBeVisible({ timeout: 10_000 });
    });
  });

  // -----------------------------------------------------------------------
  // 8.1 + 8.2 Audit API
  // -----------------------------------------------------------------------

  test('68 — list audit entries with filters', async () => {
    const { status, json } = await apiFetch('/v1/admin/audit?limit=10');
    expect(status).toBe(200);
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
  });

  test('69 — filter by action via API', async () => {
    const { status, json } = await apiFetch('/v1/admin/audit?action=user.created&limit=5');
    expect(status).toBe(200);
    if (json?.data?.length > 0) {
      expect(json.data[0].action).toBe('user.created');
    }
  });

  test('70 — filter by organization via API', async () => {
    const { status, json } = await apiFetch(
      `/v1/admin/audit?organizationId=${MOCK_IDS.ORG_ACME}&limit=5`
    );
    expect(status).toBe(200);
  });

  test('71 — combined filters via API', async () => {
    const { status } = await apiFetch(
      `/v1/admin/audit?action=user.created&organizationId=${MOCK_IDS.ORG_ACME}&limit=5`
    );
    expect(status).toBe(200);
  });

  test('72 — export CSV via API', async () => {
    const res = await fetch(
      `${process.env.VITE_API_URL || 'http://localhost:3000'}/v1/admin/audit/export`,
      {
        headers: {
          Authorization: `Bearer mock_token_${MOCK_IDS.USER_SYSTEM_ADMIN}`,
        },
      }
    );
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toMatch(/csv|text/);
  });
});
