/**
 * Assessment UI Review — iterative visual QA
 *
 * Takes screenshots at 1440×900 viewport for design review.
 * Each test captures one key view.
 */
import { test, expect } from '@playwright/test';

const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';
const BASE = `/project/${Q1_PROJECT_ID}/assessment`;
const DIR = 'test-results/ui-review';

test.use({
  viewport: { width: 1440, height: 900 },
});

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill('sarah@acme.com');
  await page.locator('input[type="password"]').fill('any');
  await page.getByRole('button', { name: /התחבר|sign in|login/i }).click();
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

test.describe('UI Review', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('01 — overview top (executive + readiness)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/01-overview-top.png` });
  });

  test('02 — overview scroll to risks', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="top-risks-card"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/02-risks-blockers.png` });
  });

  test('03 — overview scroll to analysis', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="domain-heatmap"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/03-detailed-analysis.png` });
  });

  test('04 — overview scroll to status', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="completeness"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/04-status-progress.png` });
  });

  test('05 — pricing tab', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/05-pricing.png` });
  });

  test('06 — item detail', async ({ page }) => {
    await page.goto(`${BASE}?tab=pricing`);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="inventory-table"] tbody tr').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/06-item-detail.png` });
  });

  test('07 — code tab with waterfall', async ({ page }) => {
    await page.goto(`${BASE}?tab=code`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/07-code-waterfall.png` });
  });

  test('08 — chat panel open + conversation', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Close TanStack devtools if visible (it covers the bottom of the page)
    const devtoolsClose = page.locator('button[aria-label="Close React Query Devtools"]');
    if (await devtoolsClose.isVisible({ timeout: 1000 }).catch(() => false)) {
      await devtoolsClose.click();
      await page.waitForTimeout(300);
    }
    // Also try hiding the devtools panel by clicking the toggle button
    await page.evaluate(() => {
      const devPanel = document.querySelector('.tsqd-parent-container') as HTMLElement;
      if (devPanel) devPanel.style.display = 'none';
    });
    await page.waitForTimeout(300);

    // Click the chat FAB
    const fab = page.getByLabel('Open AI Chat Assistant');
    await fab.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${DIR}/08-chat-open.png` });

    // Type a message and send
    const chatInput = page.getByLabel('Chat message');
    if (await chatInput.isVisible()) {
      await chatInput.fill('What are the critical risks?');
      await page.getByLabel('Send message').click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${DIR}/09-chat-conversation.png` });
  });
});
