import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateAdmin, apiFetch, adminHeaders } from '../fixtures/admin-helpers';

/**
 * Tests 7-9: Dashboard (Platform Overview)
 */

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('7 — dashboard loads with stats', async ({ page }) => {
    await navigateAdmin(page, '/admin');

    // Stat card labels are <h3> headings — use heading role to avoid matching the System Health section
    // which repeats the same labels inside <span> elements
    await expect(page.getByRole('heading', { name: /total tenants|סה"כ ארגונים/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: /active users|משתמשים פעילים/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /mrr|הכנסה חודשית/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /active projects|פרויקטים פעילים/i })
    ).toBeVisible();
  });

  test('8 — recent activity section renders', async ({ page }) => {
    await navigateAdmin(page, '/admin');

    // "פעילות אחרונה" or "Recent Activity" section
    await expect(page.getByText(/פעילות אחרונה|recent activity/i)).toBeVisible({ timeout: 10_000 });
  });

  test('9 — stats API returns valid data', async () => {
    // This test calls the backend directly — rate limiter may be strict.
    // Allow a warm-up delay to avoid 429 from prior test runs.
    const { status, json } = await apiFetch('/v1/admin/stats');

    if (status === 429) {
      // Rate limited — skip rather than fail (adminLimiter = 10/hour is very strict)
      test.skip();
      return;
    }

    expect(status).toBe(200);
    const data = json?.data || json;
    expect(data).toHaveProperty('tenantCount');
    expect(data).toHaveProperty('activeUserCount');
    expect(data).toHaveProperty('mrr');
    expect(data).toHaveProperty('activeProjectCount');
  });
});
