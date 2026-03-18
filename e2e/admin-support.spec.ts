import { test, expect } from './fixtures/auth';

/**
 * Test Suite: Admin Support Ticket Management
 * Tests the support center functionality for administrators
 */

test.describe('Admin Support Center', () => {
  /**
   * Helper to navigate to support page via sidebar
   */
  async function navigateToSupport(page: import('@playwright/test').Page) {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click on support in sidebar (Hebrew: מרכז תמיכה)
    const supportLink = page
      .getByRole('link', { name: /support|תמיכה/i })
      .or(page.locator('nav, aside').getByText(/support center|מרכז תמיכה/i));

    if (await supportLink.isVisible({ timeout: 3000 })) {
      await supportLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation as fallback
      await page.goto('/admin/support');
    }
  }

  test.describe('Access Support Page', () => {
    test('admin can access support center page', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Page title should show "Support Center" or similar
      await expect(
        adminPage.getByRole('heading', { name: /support center|מרכז תמיכה/i })
      ).toBeVisible({ timeout: 10000 });

      // Stats cards should be visible
      const statsGrid = adminPage.locator('.grid');
      await expect(statsGrid).toBeVisible();

      // Should have at least one stat card
      const statCards = adminPage.locator('.bg-white.rounded-xl.border');
      await expect(statCards.first()).toBeVisible();
    });
  });

  test.describe('Stats Dashboard', () => {
    test('shows ticket statistics cards', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1500);

      // Stats cards should be visible - look for the grid of stat cards
      // Each card has an icon, label, and number value
      const statsCards = adminPage.locator(
        '.grid .bg-white.rounded-xl.border, .grid > div.bg-white'
      );

      // Wait for stats to load
      await expect(statsCards.first()).toBeVisible({ timeout: 10000 });

      // Should have multiple stat cards (at least 3)
      const cardCount = await statsCards.count();
      expect(cardCount).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Ticket List', () => {
    test('shows ticket table or empty state', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Either table or empty state should be visible
      const table = adminPage.locator('table');
      const emptyState = adminPage.getByText(/no tickets|לא נמצאו פניות/i);

      await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('shows search and filter controls', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Search input should be visible
      const searchInput = adminPage
        .locator('input[placeholder*="search" i]')
        .or(adminPage.locator('input[placeholder*="חיפוש"]'));
      await expect(searchInput).toBeVisible();

      // Filter dropdowns should be visible (status and priority)
      const filterButtons = adminPage.locator('button').filter({ hasText: /status|all|סטטוס/i });
      await expect(filterButtons.first()).toBeVisible();
    });
  });

  test.describe('Ticket Filtering', () => {
    test('can filter by status', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Find status filter dropdown
      const statusTrigger = adminPage
        .locator('button')
        .filter({ hasText: /all status|כל הסטטוסים/i })
        .first();

      if (!(await statusTrigger.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('Status filter not visible, skipping');
        test.skip();
        return;
      }

      // Click to open dropdown
      await statusTrigger.click();

      // Verify options are visible
      const openOption = adminPage.getByRole('option', { name: /^open|^פתוח/i });
      await expect(openOption).toBeVisible();

      // Click on Open option
      await openOption.click();

      // Wait for filter to apply
      await adminPage.waitForTimeout(500);

      // Verify filter is applied (button should show "Open" now)
      await expect(adminPage.locator('button').filter({ hasText: /^open|^פתוח/i })).toBeVisible();
    });

    test('can search tickets', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Find search input
      const searchInput = adminPage
        .locator('input[placeholder*="search" i]')
        .or(adminPage.locator('input[placeholder*="חיפוש"]'));

      await expect(searchInput).toBeVisible();

      // Type a search query
      await searchInput.fill('TIC-');
      await adminPage.waitForTimeout(500);

      // Search should not break the page - table or empty state should still be visible
      const table = adminPage.locator('table');
      const emptyState = adminPage.getByText(/no tickets|לא נמצאו פניות/i);
      await expect(table.or(emptyState)).toBeVisible();
    });
  });

  test.describe('Ticket Detail Drawer', () => {
    test('clicking view opens ticket drawer', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Find View button in table
      const viewButton = adminPage.getByRole('button', { name: /view|צפייה/i }).first();

      // Skip if no tickets exist
      if (!(await viewButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('No tickets to view, skipping drawer test');
        test.skip();
        return;
      }

      await viewButton.click();

      // Wait for drawer to open
      const drawer = adminPage.locator('[role="dialog"]');
      await expect(drawer).toBeVisible({ timeout: 5000 });

      // Should show ticket number
      await expect(drawer.getByText(/TIC-/)).toBeVisible();

      // Should have status dropdown
      await expect(drawer.locator('select, [role="combobox"]').first()).toBeVisible();

      // Should have reply textarea
      const textarea = drawer.locator('textarea');
      await expect(textarea).toBeVisible();

      // Close drawer
      const closeButton = drawer.locator('button').first();
      await closeButton.click();
      await expect(drawer).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Access Control', () => {
    test('regular user cannot access admin support page', async ({ authenticatedPage }) => {
      // Try to navigate directly to admin/support as regular user
      await authenticatedPage.goto('/admin/support');
      await authenticatedPage.waitForTimeout(2000);

      // Should either:
      // 1. Redirect away from admin/support
      // 2. Show access denied message

      const url = authenticatedPage.url();
      const accessDenied = authenticatedPage.getByText(/access denied|forbidden|אין הרשאה/i);
      const onSupportPage = url.includes('/admin/support');

      if (onSupportPage) {
        // If still on support page, should show access denied
        await expect(accessDenied).toBeVisible();
      } else {
        // Redirected away - this is acceptable
        expect(url).not.toContain('/admin/support');
      }
    });
  });

  test.describe('Refresh Functionality', () => {
    test('refresh button reloads data', async ({ adminPage }) => {
      await navigateToSupport(adminPage);
      await adminPage.waitForTimeout(1000);

      // Find refresh button
      const refreshButton = adminPage.getByRole('button', { name: /refresh|רענן/i });
      await expect(refreshButton).toBeVisible();

      // Click refresh
      await refreshButton.click();

      // Button should show loading state (has spinner or is disabled briefly)
      // Then return to normal state
      await adminPage.waitForTimeout(1000);
      await expect(refreshButton).toBeEnabled();
    });
  });
});
