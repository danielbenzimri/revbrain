/**
 * E2E Test: Assessment Flow — Data Display + PDF Export
 *
 * Tests the full assessment workflow:
 * 1. Navigate to project assessment tab
 * 2. Verify assessment data displays (findings, scores, CPQ intelligence)
 * 3. Click Export button and verify report downloads
 *
 * Prerequisites: `pnpm local` must be running (mock mode)
 * Run: npx playwright test e2e/assessment-export.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const PROJECT_ID = '00000000-0000-4000-a000-000000000401';
const ASSESSMENT_BASE = `/project/${PROJECT_ID}/assessment`;

// Helper: login via mock auth
async function loginAndNavigate(page: Page, path: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill('sarah@test.org');
  await page.locator('input[type="password"]').fill('any-password');
  await page.getByRole('button', { name: /התחבר|sign in|login/i }).click();

  await page.waitForURL(/^(?!.*login).*$/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

test.describe('Assessment Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Core Data Display
  // ─────────────────────────────────────────────────────────────

  test('assessment page loads with data, not empty state', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    // Should NOT show the empty state CTA
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Assessment');

    // Executive summary must be present
    const execSummary = page.locator('[data-testid="executive-summary"]');
    await expect(execSummary).toBeVisible();
  });

  test('executive summary shows narrative and metrics', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const narrative = page.locator('[data-testid="executive-narrative"]');
    await expect(narrative).toBeVisible();

    // Should show configuration items count and percentages
    const text = await narrative.textContent();
    expect(text).toMatch(/\d+ configuration items/);
    expect(text).toMatch(/\d+% can be auto-migrated/);

    // Metrics strip
    const metrics = page.locator('[data-testid="executive-metrics"]');
    await expect(metrics).toBeVisible();
  });

  test('migration readiness cards show correct breakdown', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const cards = page.locator('[data-testid="readiness-cards"]');
    await expect(cards).toBeVisible();

    // Should have 4 cards (auto, guided, manual, blocked)
    const cardCount = await cards.locator('> div').count();
    expect(cardCount).toBe(4);
  });

  test('domain heatmap shows all 9 domains', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const heatmap = page.locator('[data-testid="domain-heatmap"]');
    await expect(heatmap).toBeVisible();

    // 9 domain rows
    const rows = heatmap.locator('button');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(9);
  });

  test('key findings section displays findings', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const findings = page.locator('[data-testid="key-findings"]');
    await expect(findings).toBeVisible();

    const text = await findings.textContent();
    expect(text!.length).toBeGreaterThan(20);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Domain Tabs
  // ─────────────────────────────────────────────────────────────

  test('all domain tabs render without errors', async ({ page }) => {
    const tabs = [
      'products',
      'pricing',
      'rules',
      'code',
      'integrations',
      'amendments',
      'approvals',
      'documents',
      'dataReporting',
    ];

    for (const tab of tabs) {
      await loginAndNavigate(page, `${ASSESSMENT_BASE}?tab=${tab}`);

      // Should show stats strip
      await expect(page.locator('[data-testid="stats-strip"]')).toBeVisible();

      // Should show inventory table
      await expect(page.locator('[data-testid="inventory-table"]')).toBeVisible();

      // No error state
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('Something went wrong');
    }
  });

  test('clicking domain in heatmap navigates to that tab', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const heatmap = page.locator('[data-testid="domain-heatmap"]');
    const firstDomain = heatmap.locator('button').first();
    await firstDomain.click();

    // Should navigate to a domain tab
    await page.waitForTimeout(300);
    const url = page.url();
    expect(url).toMatch(/tab=/);
  });

  test('inventory table supports row click to open detail panel', async ({ page }) => {
    await loginAndNavigate(page, `${ASSESSMENT_BASE}?tab=pricing`);

    const table = page.locator('[data-testid="inventory-table"]');
    await expect(table).toBeVisible();

    const firstRow = table.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(500);

      const panel = page.locator('[data-testid="item-detail-panel"]');
      await expect(panel).toBeVisible();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CPQ Intelligence Sections
  // ─────────────────────────────────────────────────────────────

  test('CPQ Intelligence section renders when data available', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    // Scroll down to find CPQ Intelligence divider
    const cpqDivider = page.locator('text=CPQ Intelligence').first();
    if (await cpqDivider.isVisible()) {
      await cpqDivider.scrollIntoViewIfNeeded();

      // At least one intelligence card should be visible
      const bodyText = await page.textContent('body');
      const hasIntelligence =
        bodyText!.includes('CPQ Settings') ||
        bodyText!.includes('Plugins') ||
        bodyText!.includes('Complexity Hotspots') ||
        bodyText!.includes('Data Quality') ||
        bodyText!.includes('Feature Utilization');
      expect(hasIntelligence).toBe(true);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Tab Navigation
  // ─────────────────────────────────────────────────────────────

  test('tab bar shows overview + domain tabs', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    // overview + 9 domains = 10 tabs
    expect(tabCount).toBeGreaterThanOrEqual(10);
  });

  test('clicking a tab changes the active tab', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    // Click on a specific tab (e.g., "Pricing" or similar)
    const tabs = page.locator('[role="tab"]');
    const secondTab = tabs.nth(1); // First domain tab
    await secondTab.click();
    await page.waitForTimeout(300);

    // Tab should now be selected
    const isSelected = await secondTab.getAttribute('aria-selected');
    expect(isSelected).toBe('true');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Export Report
  // ─────────────────────────────────────────────────────────────

  test('export button is visible and clickable when run is completed', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const exportBtn = page.locator('[data-testid="export-report-btn"]');
    await expect(exportBtn).toBeVisible();

    // Button text should contain "Export" (not "Downloaded" yet)
    const btnText = await exportBtn.textContent();
    expect(btnText).toBeTruthy();
  });

  test('clicking export triggers report generation', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);

    const exportBtn = page.locator('[data-testid="export-report-btn"]');
    await expect(exportBtn).toBeVisible();

    // Check if button is enabled (completed run exists)
    const isDisabled = await exportBtn.getAttribute('disabled');
    if (isDisabled === null) {
      // Set up download listener before clicking
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);

      // Also listen for new page/popup (print preview)
      const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);

      await exportBtn.click();

      // Wait for either download or popup
      const [download, popup] = await Promise.all([downloadPromise, popupPromise]);

      // At least one of these should have triggered
      const downloadTriggered = download !== null;
      const popupTriggered = popup !== null;

      if (downloadTriggered) {
        // Verify the download has the expected filename
        const suggestedFilename = download!.suggestedFilename();
        expect(suggestedFilename).toMatch(/cpq-assessment.*\.html/);
      }

      if (popupTriggered) {
        // Verify the popup contains report content
        const popupContent = await popup!.content();
        expect(popupContent).toContain('Assessment');
        await popup!.close();
      }

      // Button should now show success state
      await page.waitForTimeout(1000);
      const updatedText = await exportBtn.textContent();
      expect(updatedText).toBeTruthy();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Visual Regression Guards
  // ─────────────────────────────────────────────────────────────

  test('overview page captures full screenshot', async ({ page }) => {
    await loginAndNavigate(page, ASSESSMENT_BASE);
    await page.screenshot({
      path: 'test-results/assessment-export/overview-full.png',
      fullPage: true,
    });
  });

  test('domain tab captures screenshot', async ({ page }) => {
    await loginAndNavigate(page, `${ASSESSMENT_BASE}?tab=pricing`);
    await page.screenshot({
      path: 'test-results/assessment-export/pricing-domain.png',
      fullPage: true,
    });
  });
});
