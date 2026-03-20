import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  loginAsOperator,
  navigateAdmin,
  apiFetch,
  mockToken,
  MOCK_IDS,
  operatorHeaders,
} from '../fixtures/admin-helpers';

/**
 * Tests 1-6: Authentication & Authorization
 */

test.describe('Admin Auth & RBAC', () => {
  // -----------------------------------------------------------------------
  // 1.1 Admin Login
  // -----------------------------------------------------------------------

  test('1 — system admin sees admin sidebar', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateAdmin(page, '/admin');

    // All 7 admin nav items should be visible
    const sidebar = page.locator('nav, aside');
    await expect(sidebar.getByText(/tenants|ארגונים/i)).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText(/users|משתמשים/i)).toBeVisible();
    await expect(sidebar.getByText(/pricing|מחירים/i)).toBeVisible();
    await expect(sidebar.getByText(/coupons|קופונים/i)).toBeVisible();
    await expect(sidebar.getByText(/support|תמיכה/i)).toBeVisible();
    await expect(sidebar.getByText(/audit|ביקורת/i)).toBeVisible();
  });

  test('2 — non-admin redirected from /admin', async ({ page }) => {
    await loginAsOperator(page);
    await navigateAdmin(page, '/admin');

    // Wait for the router to process and redirect
    await page.waitForTimeout(2_000);

    // Either redirected away from /admin or shown access-denied
    const url = page.url();
    const denied = page.getByText(/access denied|forbidden|אין הרשאה/i);
    if (url.includes('/admin')) {
      await expect(denied).toBeVisible({ timeout: 5_000 });
    } else {
      expect(url).not.toContain('/admin');
    }
  });

  test('3 — unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/.*login/, { timeout: 10_000 });
  });

  // -----------------------------------------------------------------------
  // 1.2 Role-Based Access (API level)
  // -----------------------------------------------------------------------

  test('4 — admin endpoints reject non-admin tokens', async () => {
    const { status } = await apiFetch('/v1/admin/stats', {
      headers: operatorHeaders(),
    });
    expect(status).toBe(403);
  });

  test('5 — admin endpoints reject invalid token', async () => {
    const { status } = await apiFetch('/v1/admin/stats', {
      headers: {
        Authorization: 'Bearer garbage',
        'Content-Type': 'application/json',
      },
    });
    expect(status).toBe(401);
  });

  test('6 — admin endpoints reject missing auth header', async () => {
    const { status } = await apiFetch('/v1/admin/stats', {
      headers: { 'Content-Type': 'application/json' },
    });
    // Mock mode defaults to org_owner (non-admin) → 403; real mode → 401
    expect([401, 403]).toContain(status);
  });
});
