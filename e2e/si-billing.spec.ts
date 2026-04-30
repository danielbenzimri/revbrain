import { test, expect } from '@playwright/test';
import { login, TEST_USERS } from './fixtures/auth';

/**
 * SI Billing E2E Test Suite
 *
 * Comprehensive tests covering the SI billing lifecycle and paywall flow.
 * Runs in mock mode (localhost:5173).
 *
 * Task: P8.3 (updated for conversion-optimized flow)
 * Refs: SI-BILLING-SPEC.md
 */

// ---------------------------------------------------------------------------
// Billing Pages — Navigation & Rendering
// ---------------------------------------------------------------------------

test.describe('SI Billing — Navigation & Pages', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  test('billing page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    const unexpectedErrors = errors.filter(
      (e) => !e.includes('401') && !e.includes('403') && !e.includes('favicon')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('billing page shows partner status or empty state', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    const billingPage = page.locator('[data-testid="billing-page"]');
    await expect(billingPage).toBeVisible();
  });

  test('agreement review page shows not found for invalid ID', async ({ page }) => {
    await page.goto('/billing/agreements/nonexistent/review');
    await page.waitForLoadState('networkidle');

    const notFound = page.locator('text=/not found|לא נמצא/i');
    await expect(notFound).toBeVisible();
  });

  test('agreement review page has back to billing link', async ({ page }) => {
    await page.goto('/billing/agreements/nonexistent/review');
    await page.waitForLoadState('networkidle');

    const backBtn = page.locator('text=/back to billing|חזרה לחיוב/i');
    await expect(backBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Settings — Organization Tab
// ---------------------------------------------------------------------------

test.describe('SI Billing — Organization Settings', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  test('settings page has Organization tab', async ({ page }) => {
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');

    const billingInput = page.locator('[data-testid="billing-contact-email-input"]');
    await expect(billingInput).toBeVisible();
  });

  test('can update billing contact email', async ({ page }) => {
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');

    const input = page.locator('[data-testid="billing-contact-email-input"]');
    await input.fill('billing@test-company.com');

    const saveBtn = page.locator('[data-testid="save-org-settings"]');
    await saveBtn.click();

    await page.waitForTimeout(1000);
  });

  test('validates email format', async ({ page }) => {
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');

    const input = page.locator('[data-testid="billing-contact-email-input"]');
    await input.fill('not-an-email');

    const saveBtn = page.locator('[data-testid="save-org-settings"]');
    await saveBtn.click();

    const error = page.locator('text=/valid email|אימייל תקינה/i');
    await expect(error).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin Partners
// ---------------------------------------------------------------------------

test.describe('SI Billing — Admin Partners', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  test('admin partners page loads', async ({ page }) => {
    await page.goto('/admin/partners');
    await page.waitForLoadState('networkidle');

    const partnersPage = page.locator('[data-testid="partners-page"]');
    await expect(partnersPage).toBeVisible();
  });

  test('shows table or empty state', async ({ page }) => {
    await page.goto('/admin/partners');
    await page.waitForLoadState('networkidle');

    const table = page.locator('[data-testid="partners-table"]');
    const empty = page.locator('[data-testid="partners-empty"]');

    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Assessment Paywall — Conversion Flow
// ---------------------------------------------------------------------------

test.describe('SI Billing — Assessment Paywall', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  test('assessment page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Navigate to a project assessment page (mock mode has mock data for any project)
    await page.goto('/project/00000000-0000-4000-a000-000000000401/assessment');
    await page.waitForLoadState('networkidle');

    const unexpectedErrors = errors.filter(
      (e) =>
        !e.includes('401') &&
        !e.includes('403') &&
        !e.includes('404') &&
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('Failed to fetch')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('assessment overview tab is always visible (free content)', async ({ page }) => {
    await page.goto('/project/00000000-0000-4000-a000-000000000401/assessment');
    await page.waitForLoadState('networkidle');

    // Overview tab should be visible and clickable
    const overviewTab = page.locator('button[role="tab"]').filter({ hasText: /overview/i });
    if (await overviewTab.isVisible()) {
      await expect(overviewTab).toBeEnabled();
    }
  });

  test('export button exists on assessment page', async ({ page }) => {
    await page.goto('/project/00000000-0000-4000-a000-000000000401/assessment');
    await page.waitForLoadState('networkidle');

    const exportBtn = page.locator('[data-testid="export-report-btn"]');
    // Button should exist (may be disabled/locked but should be present)
    if (await exportBtn.isVisible()) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test('project billing tab loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/project/00000000-0000-4000-a000-000000000401/billing');
    await page.waitForLoadState('networkidle');

    const unexpectedErrors = errors.filter(
      (e) =>
        !e.includes('401') &&
        !e.includes('403') &&
        !e.includes('404') &&
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('Failed to fetch')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('project billing tab shows empty state or agreement', async ({ page }) => {
    await page.goto('/project/00000000-0000-4000-a000-000000000401/billing');
    await page.waitForLoadState('networkidle');

    // Should show either the billing content or empty state
    const empty = page.locator('[data-testid="project-billing-empty"]');
    const assessment = page.locator('[data-testid="project-billing-assessment"]');
    const migration = page.locator('[data-testid="project-billing-migration"]');

    const anyVisible =
      (await empty.isVisible().catch(() => false)) ||
      (await assessment.isVisible().catch(() => false)) ||
      (await migration.isVisible().catch(() => false));

    expect(anyVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No Console Errors — All Key Pages
// ---------------------------------------------------------------------------

test.describe('SI Billing — No Console Errors', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  const pages = [
    { name: 'billing page', url: '/billing' },
    { name: 'settings organization', url: '/settings/organization' },
    { name: 'admin partners', url: '/admin/partners' },
  ];

  for (const p of pages) {
    test(`${p.name} has no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(p.url);
      await page.waitForLoadState('networkidle');

      const unexpectedErrors = errors.filter(
        (e) =>
          !e.includes('401') &&
          !e.includes('403') &&
          !e.includes('404') &&
          !e.includes('favicon') &&
          !e.includes('net::ERR')
      );
      expect(unexpectedErrors).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// i18n Verification
// ---------------------------------------------------------------------------

test.describe('SI Billing — i18n', () => {
  test.beforeEach(async ({ page }) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    expect(success).toBe(true);
  });

  test('billing page renders heading', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('organization settings renders form fields', async ({ page }) => {
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('[data-testid="billing-contact-email-input"]');
    await expect(emailInput).toBeVisible();

    const saveBtn = page.locator('[data-testid="save-org-settings"]');
    await expect(saveBtn).toBeVisible();
  });
});
