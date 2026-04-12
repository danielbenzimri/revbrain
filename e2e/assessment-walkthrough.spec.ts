/**
 * Assessment Walkthrough — Professional Review
 *
 * Simulates a consultant reviewing the assessment workspace,
 * capturing screenshots at each step like a professional would
 * navigate through the document.
 */
import { test, expect } from '@playwright/test';

const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';
const BASE = `/project/${Q1_PROJECT_ID}/assessment`;
const SCREENSHOTS_DIR = 'test-results/assessment-walkthrough';

// Helper: login as mock user and navigate
async function setupPage(page: import('@playwright/test').Page) {
  // Login via mock auth
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.fill('sarah@test.org');
  await passwordInput.fill('any-password');

  const loginButton = page.getByRole('button', { name: /התחבר|sign in|login/i });
  await loginButton.click();

  // Wait for login to complete
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Assessment Walkthrough', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('Step 1: Overview — Executive Command Center', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/01-overview-full.png`,
      fullPage: true,
    });

    // Verify key elements are present
    await expect(page.locator('[data-testid="readiness-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="domain-heatmap"]')).toBeVisible();
  });

  test('Step 2: Overview — Scroll to risks and findings', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Scroll to risk section
    const risksCard = page.locator('[data-testid="top-risks-card"]');
    await risksCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/02-risks-and-findings.png`,
      fullPage: false,
    });
  });

  test('Step 3: Overview — Scroll to visualizations', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Scroll to treemap
    const treemap = page.locator('[data-testid="migration-treemap"]');
    await treemap.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/03-treemap-and-charts.png`,
      fullPage: false,
    });
  });

  test('Step 4: Overview — Org health and completeness', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Scroll to bottom sections
    const completeness = page.locator('[data-testid="completeness"]');
    await completeness.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/04-org-health-completeness.png`,
      fullPage: false,
    });
  });

  test('Step 5: Pricing domain tab — the showcase', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/05-pricing-domain.png`,
      fullPage: true,
    });

    // Verify domain tab elements
    await expect(page.locator('[data-testid="stats-strip"]')).toBeVisible();
    await expect(page.locator('[data-testid="migration-status-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="inventory-table"]')).toBeVisible();
  });

  test('Step 6: Products domain — with sub-tabs', async ({ page }) => {
    await page.goto(`${BASE}?tab=products`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/06-products-domain.png`,
      fullPage: true,
    });

    // Verify sub-tabs exist
    await expect(page.locator('[data-testid="sub-tab-sidebar"]')).toBeVisible();
  });

  test('Step 7: Code domain — with waterfall chart', async ({ page }) => {
    await page.goto(`${BASE}?tab=code`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/07-code-domain-waterfall.png`,
      fullPage: true,
    });

    // Verify waterfall is shown
    await expect(page.locator('[data-testid="code-waterfall"]')).toBeVisible();
  });

  test('Step 8: Click a pricing item — slide-over detail', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');

    // Click the first data row in the inventory table
    const firstRow = page.locator('[data-testid="inventory-table"] tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/08-item-detail-slideover.png`,
      fullPage: false,
    });

    // Verify slide-over elements
    await expect(page.locator('[data-testid="item-detail-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-description"]')).toBeVisible();
  });

  test('Step 9: Data & Reporting domain', async ({ page }) => {
    await page.goto(`${BASE}?tab=dataReporting`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/09-data-reporting.png`,
      fullPage: true,
    });
  });

  test('Step 10: Amendments domain — subscription management', async ({ page }) => {
    await page.goto(`${BASE}?tab=amendments`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    // Click subscription management sub-tab
    const subTabButton = page.locator('[data-testid="sub-tab-sidebar"] button').nth(2);
    await subTabButton.click();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/10-subscription-management.png`,
      fullPage: true,
    });
  });

  test('Step 11: View all risks — risk register', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Click "View all risks" link
    const viewAllRisks = page.locator('text=/viewAllRisks|View all.*risks/i').first();
    await viewAllRisks.scrollIntoViewIfNeeded();
    await viewAllRisks.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/11-risk-register.png`,
      fullPage: true,
    });
  });

  test('Step 12: Inventory table — filter by high complexity', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');

    // Select "high" from complexity filter
    const complexityFilter = page.locator('[data-testid="inventory-table"] select').first();
    await complexityFilter.selectOption('high');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/12-filtered-high-complexity.png`,
      fullPage: false,
    });
  });

  test('Step 13: Search in inventory', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');

    // Type in search
    const searchInput = page.locator('[data-testid="inventory-table"] input[type="text"]');
    await searchInput.fill('Enterprise');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/13-search-enterprise.png`,
      fullPage: false,
    });
  });
});
