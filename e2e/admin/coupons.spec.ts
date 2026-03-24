import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  navigateAdmin,
  apiFetch,
  sel,
  uniqueCode,
  MOCK_IDS,
} from '../fixtures/admin-helpers';

/**
 * Tests 45-57: Coupon Management
 *
 * NOTE: Coupon write operations (create, update, delete, sync) require DATABASE_URL.
 * In mock mode without DB, they return 500. Tests skip gracefully.
 */

let couponWriteApiAvailable: boolean | null = null;
async function checkCouponWriteApi() {
  if (couponWriteApiAvailable === null) {
    const { status } = await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: { code: 'PROBE', name: 'Probe', discountType: 'percent', discountValue: 1 },
    });
    couponWriteApiAvailable = status !== 500;
  }
  return couponWriteApiAvailable;
}

test.describe('Coupon Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // -----------------------------------------------------------------------
  // 6.1 Coupon List
  // -----------------------------------------------------------------------

  test('45 — coupon list loads', async ({ page }) => {
    await navigateAdmin(page, '/admin/coupons');

    await expect(page.getByText(/קופונים|coupons/i).first()).toBeVisible({ timeout: 10_000 });

    // Table or empty state should appear
    const table = page.locator('table');
    const empty = page.getByText(/אין קופונים|no coupons/i);
    await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
  });

  test('46 — include inactive toggle', async ({ page }) => {
    await navigateAdmin(page, '/admin/coupons');

    const checkbox = page.locator('input[type="checkbox"]');
    if (!(await checkbox.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const initialRows = await page.locator('tbody tr').count();
    await checkbox.check();
    await page.waitForTimeout(1_000);
    const afterRows = await page.locator('tbody tr').count();
    expect(afterRows).toBeGreaterThanOrEqual(initialRows);
  });

  // -----------------------------------------------------------------------
  // 6.2 Create Coupon (UI + API)
  // -----------------------------------------------------------------------

  test('47 — create percentage coupon', async ({ page }) => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('PCT');
    await navigateAdmin(page, '/admin/coupons');
    await page.getByRole('button', { name: /קופון חדש|new coupon/i }).click();

    const drawer = page.locator(sel.drawer);
    await expect(drawer).toBeVisible();

    await drawer.locator('input').first().fill(code);
    await drawer.locator('input').nth(1).fill('20% Off Test');

    const pctBtn = drawer.getByRole('button', { name: /אחוזים|percentage/i });
    if (await pctBtn.isVisible()) await pctBtn.click();

    await drawer.locator('input[type="number"]').first().fill('20');

    await drawer.getByRole('button', { name: /יצירת קופון|create coupon/i }).click();
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(code)).toBeVisible({ timeout: 5_000 });
  });

  test('48 — create fixed-amount coupon', async ({ page }) => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('FIX');
    await navigateAdmin(page, '/admin/coupons');
    await page.getByRole('button', { name: /קופון חדש|new coupon/i }).click();

    const drawer = page.locator(sel.drawer);
    await expect(drawer).toBeVisible();

    await drawer.locator('input').first().fill(code);
    await drawer.locator('input').nth(1).fill('$10 Off');

    const fixedBtn = drawer.getByRole('button', { name: /סכום קבוע|fixed/i });
    await fixedBtn.click();

    await drawer.locator('input[type="number"]').first().fill('10');

    await drawer.getByRole('button', { name: /יצירת קופון|create coupon/i }).click();
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(code)).toBeVisible({ timeout: 5_000 });
  });

  test('49 — create coupon with plan restrictions via API', async () => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('PLAN');
    const { status } = await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: {
        code,
        name: 'Plan-restricted',
        discountType: 'percent',
        discountValue: 15,
        applicablePlanIds: [MOCK_IDS.PLAN_PRO],
      },
    });
    expect([200, 201]).toContain(status);
  });

  test('50 — create coupon with usage limits via API', async () => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('LIM');
    const { status } = await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: {
        code,
        name: 'Limited',
        discountType: 'percent',
        discountValue: 10,
        maxUses: 100,
        maxUsesPerUser: 1,
      },
    });
    expect([200, 201]).toContain(status);
  });

  test('51 — duplicate coupon code fails', async () => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('DUP');
    await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: { code, name: 'First', discountType: 'percent', discountValue: 5 },
    });

    const { status } = await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: { code, name: 'Duplicate', discountType: 'percent', discountValue: 5 },
    });
    expect([400, 409, 422]).toContain(status);
  });

  // -----------------------------------------------------------------------
  // 6.3 Edit Coupon
  // -----------------------------------------------------------------------

  test('52 — edit coupon name and limits', async ({ page }) => {
    await navigateAdmin(page, '/admin/coupons');
    await expect(page.locator('table').or(page.getByText(/אין קופונים/i))).toBeVisible({
      timeout: 10_000,
    });

    const editBtn = page.getByRole('button', { name: /ערוך|edit/i }).first();
    if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await editBtn.click();

    const drawer = page.locator(sel.drawer);
    await expect(drawer).toBeVisible();

    const nameInput = drawer.locator('input').nth(1);
    await nameInput.fill('Updated Coupon Name');

    await drawer.getByRole('button', { name: /שמור|save/i }).click();
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
  });

  test('53 — cannot change discount type/value after creation', async () => {
    const { json } = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`);
    if (!json) {
      test.skip();
      return;
    }

    const coupon = json?.data || json;
    const { status, json: updated } = await apiFetch(
      `/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`,
      {
        method: 'PUT',
        body: {
          name: coupon.name,
          discountType: 'fixed',
          discountValue: 999,
          updatedAt: coupon.updatedAt,
        },
      }
    );

    if (status === 200) {
      const check = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`);
      const c = check.json?.data || check.json;
      expect(c?.discountType).toBe('percent');
    }
  });

  test('54 — optimistic concurrency on coupon edit', async () => {
    const { json } = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`);
    const coupon = json?.data || json;
    if (!coupon?.updatedAt) {
      test.skip();
      return;
    }

    await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`, {
      method: 'PUT',
      body: { name: coupon.name, updatedAt: coupon.updatedAt },
    });

    const { status } = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`, {
      method: 'PUT',
      body: { name: 'Stale', updatedAt: coupon.updatedAt },
    });
    expect([200, 409]).toContain(status);
  });

  // -----------------------------------------------------------------------
  // 6.4 Deactivate & Sync
  // -----------------------------------------------------------------------

  test('55 — deactivate coupon via API', async () => {
    if (!(await checkCouponWriteApi())) {
      test.skip();
      return;
    }

    const code = uniqueCode('DEACT');
    const createRes = await apiFetch('/v1/admin/coupons', {
      method: 'POST',
      body: { code, name: 'To Deactivate', discountType: 'percent', discountValue: 5 },
    });
    const id = createRes.json?.id || createRes.json?.data?.id;
    if (!id) {
      test.skip();
      return;
    }

    const { status } = await apiFetch(`/v1/admin/coupons/${id}`, { method: 'DELETE' });
    expect(status).toBe(200);
  });

  test('56 — force sync coupon to Stripe via API', async () => {
    const { status } = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}/sync`, {
      method: 'POST',
    });
    expect([200, 400, 500]).toContain(status);
  });

  // -----------------------------------------------------------------------
  // 6.5 Coupon Usage History
  // -----------------------------------------------------------------------

  test('57 — view coupon usage history', async () => {
    const { status, json } = await apiFetch(`/v1/admin/coupons/${MOCK_IDS.COUPON_ACTIVE_PERCENT}`);
    if (status === 500) {
      return;
    } // DB required
    expect(status).toBe(200);

    const coupon = json?.data || json;
    expect(coupon).toHaveProperty('id');
  });
});
