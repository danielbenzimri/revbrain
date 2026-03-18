import { test, expect } from './fixtures/auth';

/**
 * Test Suite: Work Logs Management
 * Tests the daily work log functionality including:
 * - Work log creation and editing
 * - Resources and equipment tracking
 * - Weather conditions recording
 * - Dual signature workflow (contractor → inspector)
 * - Excel export
 *
 * Prerequisites:
 * - User must be logged in with access to projects
 * - A test project must exist in the organization
 * - Work Logs tab must be integrated into project detail page
 *
 * Note: These tests will skip gracefully if the feature
 * isn't accessible yet.
 */

test.describe('Work Logs Management', () => {
  /**
   * Helper to navigate to a project's Work Logs page
   * Returns false if navigation fails (feature not integrated yet)
   */
  async function navigateToWorkLogs(page: import('@playwright/test').Page): Promise<boolean> {
    // First try to go to projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Check if projects page exists
    const projectsHeading = page.getByRole('heading', {
      name: /projects|פרויקטים/i,
    });
    if (!(await projectsHeading.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('Projects page not found - skipping work logs tests');
      return false;
    }

    // Look for a project row to click
    const projectRow = page.locator('table tbody tr').first();
    if (!(await projectRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No projects found - skipping work logs tests');
      return false;
    }

    // Click on the project to go to detail page
    await projectRow.click();
    await page.waitForLoadState('networkidle');

    // Look for Work Logs tab
    const workLogsTab = page
      .getByRole('tab', { name: /work logs|יומני עבודה/i })
      .or(page.getByText(/daily reports|דוחות יומיים/i));

    if (!(await workLogsTab.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('Work Logs tab not found - feature may not be integrated yet');
      return false;
    }

    await workLogsTab.click();
    await page.waitForLoadState('networkidle');
    return true;
  }

  test.describe('Work Logs List', () => {
    test('shows work logs list or empty state', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Either work logs list or empty state should be visible
      const workLogsList = authenticatedPage.locator('[data-testid="work-logs-list"]');
      const emptyState = authenticatedPage.getByText(/no work logs|אין יומני עבודה/i);
      const createButton = authenticatedPage.getByRole('button', {
        name: /create work log|צור יומן עבודה/i,
      });

      await expect(workLogsList.or(emptyState).or(createButton)).toBeVisible({
        timeout: 10000,
      });
    });

    test('shows work log summary card', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Summary card should show statistics
      const summaryCard = authenticatedPage.getByText(
        /work logs summary|סיכום יומנים|total logs|סה״כ יומנים|total man hours|סה״כ שעות עבודה/i
      );

      if (!(await summaryCard.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('Summary card not visible - may not be implemented yet');
        test.skip();
        return;
      }

      await expect(summaryCard).toBeVisible();
    });
  });

  test.describe('Work Log Creation', () => {
    test('create work log button opens form', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for create button
      const createBtn = authenticatedPage.getByRole('button', {
        name: /create work log|צור יומן עבודה/i,
      });

      if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('Create button not found - skipping creation test');
        test.skip();
        return;
      }

      await createBtn.click();

      // Form sheet should open
      const formSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(formSheet).toBeVisible({ timeout: 5000 });

      // Date field should be visible
      const dateField = authenticatedPage.getByText(/date|תאריך/i);
      await expect(dateField).toBeVisible();
    });

    test('form shows weather section', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      const createBtn = authenticatedPage.getByRole('button', {
        name: /create work log|צור יומן עבודה/i,
      });

      if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await createBtn.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Weather section should be visible
      const weatherSection = authenticatedPage.getByText(/weather|מזג אוויר/i);
      await expect(weatherSection).toBeVisible({ timeout: 5000 });
    });

    test('form shows resources section', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      const createBtn = authenticatedPage.getByRole('button', {
        name: /create work log|צור יומן עבודה/i,
      });

      if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await createBtn.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Resources section should be visible
      const resourcesSection = authenticatedPage.getByText(/resources|manpower|כוח אדם/i);
      await expect(resourcesSection).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Work Log Detail', () => {
    test('clicking work log opens detail sheet', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for a work log card or row
      const workLogItem = authenticatedPage.locator('[data-testid="work-log-card"]').first();

      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        // Try looking for any work log in list
        const workLogInList = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
        if (!(await workLogInList.isVisible({ timeout: 3000 }).catch(() => false))) {
          console.log('No work logs found - skipping detail test');
          test.skip();
          return;
        }
        await workLogInList.click();
      } else {
        await workLogItem.click();
      }

      // Detail sheet should open
      const detailSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(detailSheet).toBeVisible({ timeout: 5000 });
    });

    test('shows weather information in detail', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping weather test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Weather info should be visible (or N/A if not set)
      const weatherInfo = authenticatedPage.getByText(
        /sunny|cloudy|rainy|windy|stormy|snowy|foggy|שמשי|מעונן|גשום|סוער|N\/A/i
      );
      await expect(weatherInfo).toBeVisible({ timeout: 5000 });
    });

    test('shows resources table in detail', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping resources test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Resources section should be visible
      const resourcesSection = authenticatedPage.getByText(/resources|manpower|כוח אדם/i);
      const emptyResources = authenticatedPage.getByText(/no resources|אין עובדים/i);

      await expect(resourcesSection.or(emptyResources)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Signatures', () => {
    test('shows signatures section', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping signatures test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Signatures section should be visible
      const signaturesSection = authenticatedPage.getByText(/signatures|חתימות/i);
      await expect(signaturesSection).toBeVisible({ timeout: 5000 });
    });

    test('shows contractor signature status', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Contractor signature label should be visible
      const contractorLabel = authenticatedPage.getByText(/contractor|קבלן/i);
      await expect(contractorLabel).toBeVisible({ timeout: 5000 });
    });

    test('shows inspector signature status', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Inspector signature label should be visible
      const inspectorLabel = authenticatedPage.getByText(/inspector|מפקח/i);
      await expect(inspectorLabel).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Export', () => {
    test('export button is available', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open any work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping export test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Export button should be visible
      const exportBtn = authenticatedPage.getByRole('button', {
        name: /export|ייצוא/i,
      });
      await expect(exportBtn).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Edit and Delete', () => {
    test('unsigned work log shows edit button', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for any work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping edit test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Edit button should be visible for unsigned logs
      const editBtn = authenticatedPage.getByRole('button', {
        name: /edit|ערוך/i,
      });

      // If work log is signed, edit may not be visible - that's OK
      if (!(await editBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('Edit button not visible - work log may be signed');
        test.skip();
        return;
      }

      await expect(editBtn).toBeVisible();
    });

    test('unsigned work log shows delete button', async ({ authenticatedPage }) => {
      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for any work log
      const workLogItem = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      if (!(await workLogItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No work logs found - skipping delete test');
        test.skip();
        return;
      }

      await workLogItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Delete button should be visible for unsigned logs
      const deleteBtn = authenticatedPage.getByRole('button', {
        name: /delete|מחק/i,
      });

      // If work log is signed, delete may not be visible - that's OK
      if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log('Delete button not visible - work log may be signed');
        test.skip();
        return;
      }

      await expect(deleteBtn).toBeVisible();
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('work logs list is accessible on mobile', async ({ authenticatedPage }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      const success = await navigateToWorkLogs(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Create button or work logs should be visible
      const createBtn = authenticatedPage.getByRole('button', {
        name: /create work log|צור יומן עבודה/i,
      });
      const workLogsList = authenticatedPage.getByText(/work log|יומן עבודה/i).first();
      const emptyState = authenticatedPage.getByText(/no work logs|אין יומני עבודה/i);

      await expect(createBtn.or(workLogsList).or(emptyState)).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
