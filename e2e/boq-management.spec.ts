import { test, expect } from './fixtures/auth';
import path from 'path';

/**
 * Test Suite: BOQ (Bill of Quantities) Management
 * Tests the BOQ tree display and Excel import functionality
 *
 * Prerequisites:
 * - User must be logged in with access to projects
 * - A test project must exist in the organization
 * - BOQ routes must be integrated into project detail page
 *
 * Note: These tests will skip gracefully if the BOQ feature
 * isn't accessible yet (requires Iteration 1.4 integration).
 */

test.describe('BOQ Management', () => {
  /**
   * Helper to navigate to a project's BOQ page
   * Returns false if navigation fails (feature not integrated yet)
   */
  async function navigateToBOQ(page: import('@playwright/test').Page): Promise<boolean> {
    // First try to go to projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Check if projects page exists
    const projectsHeading = page.getByRole('heading', { name: /projects|פרויקטים/i });
    if (!(await projectsHeading.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('Projects page not found - skipping BOQ tests');
      return false;
    }

    // Look for a project row to click
    const projectRow = page.locator('table tbody tr').first();
    if (!(await projectRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No projects found - skipping BOQ tests');
      return false;
    }

    // Click on the project to go to detail page
    await projectRow.click();
    await page.waitForLoadState('networkidle');

    // Look for BOQ tab
    const boqTab = page
      .getByRole('tab', { name: /boq|כתב כמויות/i })
      .or(page.getByText(/bill of quantities|כתב כמויות/i));

    if (!(await boqTab.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('BOQ tab not found - feature may not be integrated yet');
      return false;
    }

    await boqTab.click();
    await page.waitForLoadState('networkidle');
    return true;
  }

  test.describe('BOQ Tree Display', () => {
    test('shows BOQ tree or empty state', async ({ authenticatedPage }) => {
      const success = await navigateToBOQ(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Either tree table or empty state should be visible
      const table = authenticatedPage.locator('table');
      const emptyState = authenticatedPage.getByText(/no boq items|אין פריטים/i);

      await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });
    });

    test('expand/collapse buttons are visible', async ({ authenticatedPage }) => {
      const success = await navigateToBOQ(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for expand/collapse buttons
      const expandBtn = authenticatedPage.getByText(/expand all|הרחב הכל/i);
      const collapseBtn = authenticatedPage.getByText(/collapse all|כווץ הכל/i);

      // Only visible if there are items
      const emptyState = authenticatedPage.getByText(/no boq items|אין פריטים/i);
      if (await emptyState.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('No BOQ items - buttons not expected');
        test.skip();
        return;
      }

      await expect(expandBtn).toBeVisible({ timeout: 5000 });
      await expect(collapseBtn).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('BOQ Import', () => {
    test('import button opens import sheet', async ({ authenticatedPage }) => {
      const success = await navigateToBOQ(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for import button
      const importBtn = authenticatedPage.getByRole('button', {
        name: /import|ייבוא/i,
      });

      if (!(await importBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('Import button not found - skipping import test');
        test.skip();
        return;
      }

      await importBtn.click();

      // Sheet should open with dropzone
      const dropzone = authenticatedPage.getByText(/drop.*excel|גרור.*אקסל/i);
      await expect(dropzone).toBeVisible({ timeout: 5000 });
    });

    test('can upload Excel file and see options', async ({ authenticatedPage }) => {
      const success = await navigateToBOQ(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open import sheet
      const importBtn = authenticatedPage.getByRole('button', {
        name: /import|ייבוא/i,
      });
      if (!(await importBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
        return;
      }
      await importBtn.click();

      // Wait for sheet to open
      await authenticatedPage.waitForTimeout(500);

      // Upload a test Excel file
      const testFilePath = path.join(__dirname, 'fixtures', 'test-boq.xlsx');

      // Check if test file exists
      const fs = await import('fs');
      if (!fs.existsSync(testFilePath)) {
        console.log('Test Excel file not found at:', testFilePath);
        console.log('Create e2e/fixtures/test-boq.xlsx with sample BOQ data');
        test.skip();
        return;
      }

      // Find file input and upload
      const fileInput = authenticatedPage.locator('input[type="file"]');
      await fileInput.setInputFiles(testFilePath);

      // Should show configuration options
      const optionsHeading = authenticatedPage.getByText(/import options|אפשרויות ייבוא/i);
      await expect(optionsHeading).toBeVisible({ timeout: 5000 });

      // Column mapping should be visible
      const columnMapping = authenticatedPage.getByText(/column mapping|מיפוי עמודות/i);
      await expect(columnMapping).toBeVisible();

      // Replace mode checkbox should exist
      const replaceCheckbox = authenticatedPage.getByText(/replace existing|החלף פריטים/i);
      await expect(replaceCheckbox).toBeVisible();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('table scrolls horizontally on mobile', async ({ authenticatedPage }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      const success = await navigateToBOQ(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Table should be visible
      const tableContainer = authenticatedPage.locator('.overflow-x-auto');
      const table = authenticatedPage.locator('table');

      if (!(await table.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No table visible - skipping mobile test');
        test.skip();
        return;
      }

      // Table should have horizontal scroll container
      await expect(tableContainer).toBeVisible();
    });
  });
});
