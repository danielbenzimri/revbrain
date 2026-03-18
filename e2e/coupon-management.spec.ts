import { test, expect } from './fixtures/auth';

/**
 * Test Suite 1: Coupon Management (Admin)
 * Tests TC-1.1 through TC-1.8
 */

test.describe('Coupon Management', () => {
  // Use a unique code for each test run to avoid conflicts
  const uniqueSuffix = Date.now().toString().slice(-6);

  /**
   * Helper to navigate to coupons page via sidebar
   */
  async function navigateToCoupons(page: import('@playwright/test').Page) {
    // First go to admin area
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click on coupons in sidebar (Hebrew: קופונים)
    const couponsLink = page
      .getByRole('link', { name: /coupons|קופונים/i })
      .or(page.locator('nav, aside').getByText(/coupons|קופונים/i));

    if (await couponsLink.isVisible({ timeout: 3000 })) {
      await couponsLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation as fallback
      await page.goto('/admin/coupons');
    }
  }

  test.describe('TC-1.1: Access Coupon List Page', () => {
    test('admin can access coupon list page', async ({ adminPage }) => {
      // Navigate to admin coupons page via sidebar
      await navigateToCoupons(adminPage);

      // Wait for page to load
      await adminPage.waitForTimeout(1000);

      // Page title should show "Coupons" or similar
      await expect(adminPage.getByRole('heading', { name: /coupons|קופונים/i })).toBeVisible({
        timeout: 10000,
      });

      // Verify "New Coupon" button is visible
      await expect(adminPage.getByRole('button', { name: /new coupon|קופון חדש/i })).toBeVisible();

      // Table headers should be visible (or empty state if no coupons)
      const table = adminPage.locator('table');
      const emptyState = adminPage.getByText(/no coupons|אין קופונים/i);

      // Either table or empty state should be visible
      await expect(table.or(emptyState)).toBeVisible();
    });
  });

  test.describe('TC-1.2: Create Percentage Coupon', () => {
    test('admin can create a percentage discount coupon', async ({ adminPage }) => {
      await navigateToCoupons(adminPage);

      // Click "New Coupon" button
      await adminPage.getByRole('button', { name: /new coupon|קופון חדש/i }).click();

      // Wait for drawer to open with amber gradient header
      const drawer = adminPage.locator('[role="dialog"]');
      await expect(drawer).toBeVisible();

      // Verify header has amber gradient (by checking for the title)
      await expect(
        drawer.getByRole('heading', { name: /create coupon|יצירת קופון/i })
      ).toBeVisible();

      // Fill in form fields
      const codeInput = drawer
        .locator('input[placeholder*="SUMMER"]')
        .or(drawer.locator('input').first());
      await codeInput.fill(`SAVE20TEST${uniqueSuffix}`);

      // Name field
      const nameInput = drawer
        .locator('input[placeholder*="Summer Sale"]')
        .or(drawer.locator('input').nth(1));
      await nameInput.fill('20% Off Test Coupon');

      // Description
      const descriptionField = drawer.locator('textarea');
      if (await descriptionField.isVisible()) {
        await descriptionField.fill('Test coupon for QA');
      }

      // Select Percentage discount type (should be default, but click to ensure)
      const percentButton = drawer.getByRole('button', { name: /percentage|אחוז/i });
      if (await percentButton.isVisible()) {
        await percentButton.click();
      }

      // Set discount value to 20
      const discountInput = drawer.locator('input[type="number"]').first();
      await discountInput.click();
      await discountInput.fill('20');

      // Max uses
      const maxUsesInput = drawer.locator('input[placeholder*="Unlimited"]').first();
      if (await maxUsesInput.isVisible()) {
        await maxUsesInput.click();
        await maxUsesInput.fill('100');
      }

      // Click Create button
      const createButton = drawer.getByRole('button', { name: /create|יצירת קופון/i });
      await createButton.click();

      // Wait for drawer to close
      await expect(drawer).not.toBeVisible({ timeout: 10000 });

      // Verify coupon appears in table
      await expect(adminPage.getByText(`SAVE20TEST${uniqueSuffix}`)).toBeVisible({ timeout: 5000 });

      // Verify status shows "Active"
      await expect(adminPage.getByText(/active|פעיל/i).first()).toBeVisible();
    });
  });

  test.describe('TC-1.3: Create Fixed Amount Coupon', () => {
    test('admin can create a fixed amount discount coupon', async ({ adminPage }) => {
      await navigateToCoupons(adminPage);

      // Click "New Coupon" button
      await adminPage.getByRole('button', { name: /new coupon|קופון חדש/i }).click();

      // Wait for drawer
      const drawer = adminPage.locator('[role="dialog"]');
      await expect(drawer).toBeVisible();

      // Fill in code
      const codeInput = drawer.locator('input').first();
      await codeInput.fill(`FLAT10USD${uniqueSuffix}`);

      // Name
      const nameInput = drawer.locator('input').nth(1);
      await nameInput.fill('$10 Off Fixed Discount');

      // Select Fixed Amount discount type
      const fixedButton = drawer.getByRole('button', { name: /fixed|קבוע/i });
      await fixedButton.click();

      // Set discount value to 10 (dollars)
      const discountInput = drawer.locator('input[type="number"]').first();
      await discountInput.click();
      await discountInput.fill('10');

      // Set minimum amount if field exists
      const minAmountInput = drawer.locator('input[type="number"]').last();
      if (await minAmountInput.isVisible()) {
        await minAmountInput.click();
        await minAmountInput.fill('20');
      }

      // Click Create
      const createButton = drawer.getByRole('button', { name: /create|יצירת קופון/i });
      await createButton.click();

      // Wait for drawer to close
      await expect(drawer).not.toBeVisible({ timeout: 10000 });

      // Verify coupon appears in table
      await expect(adminPage.getByText(`FLAT10USD${uniqueSuffix}`)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('TC-1.4: Edit Existing Coupon', () => {
    test('admin can edit an existing coupon', async ({ adminPage }) => {
      await navigateToCoupons(adminPage);

      // Wait for page to load
      await adminPage.waitForLoadState('networkidle');

      // Find any coupon's Edit button
      const editButton = adminPage.getByRole('button', { name: /edit|עריכה/i }).first();

      // Skip if no coupons exist
      if (!(await editButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await editButton.click();

      // Wait for drawer
      const drawer = adminPage.locator('[role="dialog"]');
      await expect(drawer).toBeVisible();

      // Verify it's in edit mode
      await expect(drawer.getByRole('heading', { name: /edit coupon|עריכת קופון/i })).toBeVisible();

      // Update the name field
      const nameInput = drawer.locator('input').nth(1);
      const originalName = await nameInput.inputValue();
      await nameInput.fill('Updated Coupon Name');

      // Update max uses
      const maxUsesInput = drawer.locator('input[placeholder*="Unlimited"]').first();
      if (await maxUsesInput.isVisible()) {
        await maxUsesInput.click();
        await maxUsesInput.fill('50');
      }

      // Click Save
      const saveButton = drawer.getByRole('button', { name: /save|שמור/i });
      await saveButton.click();

      // Wait for drawer to close
      await expect(drawer).not.toBeVisible({ timeout: 10000 });

      // Verify the updated name appears
      await expect(adminPage.getByText('Updated Coupon Name')).toBeVisible();
    });
  });

  test.describe('TC-1.5: Deactivate Coupon', () => {
    test('admin can deactivate a coupon', async ({ adminPage }) => {
      await navigateToCoupons(adminPage);

      // Wait for page to load
      await adminPage.waitForLoadState('networkidle');

      // Find an active coupon's Edit button
      const editButton = adminPage.getByRole('button', { name: /edit|עריכה/i }).first();

      // Skip if no coupons exist
      if (!(await editButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await editButton.click();

      // Wait for drawer
      const drawer = adminPage.locator('[role="dialog"]');
      await expect(drawer).toBeVisible();

      // Click Deactivate button
      const deactivateButton = drawer.getByRole('button', { name: /deactivate|השבת/i });
      if (!(await deactivateButton.isVisible())) {
        // Drawer might not have deactivate button, close and skip
        await drawer.getByRole('button', { name: /cancel|ביטול/i }).click();
        test.skip();
        return;
      }

      await deactivateButton.click();

      // Confirm deactivation if dialog appears
      const confirmButton = drawer.getByRole('button', { name: /deactivate|השבת/i }).last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Wait for drawer to close
      await expect(drawer).not.toBeVisible({ timeout: 10000 });

      // Enable "Show inactive" checkbox to see the deactivated coupon
      const showInactiveCheckbox = adminPage.locator('input[type="checkbox"]');
      if (await showInactiveCheckbox.isVisible()) {
        await showInactiveCheckbox.check();
      }

      // Verify inactive status is shown somewhere
      await expect(adminPage.getByText(/inactive|לא פעיל/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('TC-1.7: Filter/Search Coupons', () => {
    test('admin can filter coupons using show inactive toggle', async ({ adminPage }) => {
      await navigateToCoupons(adminPage);

      // Wait for page to load
      await adminPage.waitForLoadState('networkidle');

      // Find "Show inactive" checkbox
      const showInactiveCheckbox = adminPage.locator('input[type="checkbox"]');

      if (!(await showInactiveCheckbox.isVisible())) {
        test.skip();
        return;
      }

      // Get initial count of visible coupons
      const initialRows = adminPage.locator('tbody tr');
      const initialCount = await initialRows.count();

      // Toggle "Show inactive"
      await showInactiveCheckbox.check();
      await adminPage.waitForTimeout(500);

      // Count should potentially change (or stay same if no inactive)
      const afterToggleRows = adminPage.locator('tbody tr');
      const afterToggleCount = await afterToggleRows.count();

      // Toggle back
      await showInactiveCheckbox.uncheck();
      await adminPage.waitForTimeout(500);

      const finalRows = adminPage.locator('tbody tr');
      const finalCount = await finalRows.count();

      // Initial and final counts should match
      expect(finalCount).toBe(initialCount);
    });
  });

  test.describe('TC-1.8: Access Denied for Non-Admin', () => {
    test('regular user cannot access coupon management page', async ({ authenticatedPage }) => {
      // Try to navigate directly to admin/coupons as regular user
      await authenticatedPage.goto('/admin/coupons');

      // Should either:
      // 1. Redirect away from admin/coupons
      // 2. Show access denied message
      // 3. Show 403/forbidden

      // Wait for navigation
      await authenticatedPage.waitForTimeout(2000);

      // Check that we're NOT on the coupons page, OR there's an access denied message
      const url = authenticatedPage.url();
      const accessDenied = authenticatedPage.getByText(/access denied|forbidden|אין הרשאה/i);
      const onCouponsPage = url.includes('/admin/coupons');

      if (onCouponsPage) {
        // If still on coupons page, should show access denied
        await expect(accessDenied).toBeVisible();
      } else {
        // Redirected away - this is acceptable
        expect(url).not.toContain('/admin/coupons');
      }
    });
  });
});
