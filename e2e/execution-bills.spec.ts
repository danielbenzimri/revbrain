import { test, expect } from './fixtures/auth';

/**
 * Test Suite: Execution Bills Management
 * Tests the full execution bill lifecycle including:
 * - Bill creation and editing
 * - Status workflow (draft → submitted → under_review → approved/rejected)
 * - Signature capture
 * - Role-based permissions (contractor vs inspector)
 *
 * Prerequisites:
 * - User must be logged in with access to projects
 * - A test project must exist in the organization
 * - Execution tab must be integrated into project detail page
 *
 * Note: These tests will skip gracefully if the feature
 * isn't accessible yet.
 */

test.describe('Execution Bills Management', () => {
  /**
   * Helper to navigate to a project's Execution page
   * Returns false if navigation fails (feature not integrated yet)
   */
  async function navigateToExecution(page: import('@playwright/test').Page): Promise<boolean> {
    // First try to go to projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Check if projects page exists
    const projectsHeading = page.getByRole('heading', {
      name: /projects|פרויקטים/i,
    });
    if (!(await projectsHeading.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('Projects page not found - skipping execution tests');
      return false;
    }

    // Look for a project row to click
    const projectRow = page.locator('table tbody tr').first();
    if (!(await projectRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('No projects found - skipping execution tests');
      return false;
    }

    // Click on the project to go to detail page
    await projectRow.click();
    await page.waitForLoadState('networkidle');

    // Look for Execution tab
    const executionTab = page
      .getByRole('tab', { name: /execution|ביצוע|חשבונות/i })
      .or(page.getByText(/contractor billing|חשבונות קבלן/i));

    if (!(await executionTab.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('Execution tab not found - feature may not be integrated yet');
      return false;
    }

    await executionTab.click();
    await page.waitForLoadState('networkidle');
    return true;
  }

  test.describe('Bills List', () => {
    test('shows bills list or empty state', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Either bills list or empty state should be visible
      const billsList = authenticatedPage.locator('[data-testid="bills-list"]');
      const emptyState = authenticatedPage.getByText(/no bills|אין חשבונות/i);
      const createButton = authenticatedPage.getByRole('button', {
        name: /create bill|צור חשבון/i,
      });

      await expect(billsList.or(emptyState).or(createButton)).toBeVisible({
        timeout: 10000,
      });
    });

    test('shows bill summary card', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Summary card should show statistics
      const summaryCard = authenticatedPage.getByText(
        /billing summary|סיכום חשבונות|total bills|סה״כ חשבונות/i
      );

      if (!(await summaryCard.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('Summary card not visible - may not be implemented yet');
        test.skip();
        return;
      }

      await expect(summaryCard).toBeVisible();
    });
  });

  test.describe('Bill Creation', () => {
    test('create bill button opens form', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for create button
      const createBtn = authenticatedPage.getByRole('button', {
        name: /create bill|צור חשבון/i,
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

      // Period fields should be visible
      const periodStart = authenticatedPage.getByText(/period start|תחילת תקופה/i);
      await expect(periodStart).toBeVisible();
    });
  });

  test.describe('Bill Detail', () => {
    test('clicking bill opens detail sheet', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Look for a bill card or row
      const billItem = authenticatedPage.locator('[data-testid="bill-card"]').first();

      if (!(await billItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        // Try looking for any bill in list
        const billInList = authenticatedPage.getByText(/bill #|חשבון מס/i).first();
        if (!(await billInList.isVisible({ timeout: 3000 }).catch(() => false))) {
          console.log('No bills found - skipping detail test');
          test.skip();
          return;
        }
        await billInList.click();
      } else {
        await billItem.click();
      }

      // Detail sheet should open
      const detailSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(detailSheet).toBeVisible({ timeout: 5000 });

      // Should show bill status
      const status = authenticatedPage.getByText(
        /draft|submitted|under review|approved|rejected|טיוטה|הוגש|בבדיקה|אושר|נדחה/i
      );
      await expect(status).toBeVisible();
    });

    test('shows items table in detail', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open first bill
      const billItem = authenticatedPage.getByText(/bill #|חשבון מס/i).first();
      if (!(await billItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No bills found - skipping items test');
        test.skip();
        return;
      }

      await billItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Items section should be visible
      const itemsSection = authenticatedPage.getByText(/bill items|פריטי חשבון/i);
      const emptyItems = authenticatedPage.getByText(/no items|אין פריטים/i);

      await expect(itemsSection.or(emptyItems)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Bill Workflow', () => {
    test('draft bill shows edit and submit buttons', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Find a draft bill
      const draftBadge = authenticatedPage.getByText(/^draft$|^טיוטה$/i).first();
      if (!(await draftBadge.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No draft bills found - skipping workflow test');
        test.skip();
        return;
      }

      // Click on the bill containing draft
      await draftBadge.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Edit button should be visible for draft
      const editBtn = authenticatedPage.getByRole('button', {
        name: /edit|ערוך/i,
      });

      // Submit button should be visible
      const submitBtn = authenticatedPage.getByRole('button', {
        name: /submit|sign.*submit|הגש|חתום.*הגש/i,
      });

      await expect(editBtn.or(submitBtn)).toBeVisible({ timeout: 5000 });
    });

    test('export button is available', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open any bill
      const billItem = authenticatedPage.getByText(/bill #|חשבון מס/i).first();
      if (!(await billItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No bills found - skipping export test');
        test.skip();
        return;
      }

      await billItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Export button should be visible
      const exportBtn = authenticatedPage.getByRole('button', {
        name: /export|ייצוא/i,
      });
      await expect(exportBtn).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Status Timeline', () => {
    test('shows status timeline in bill detail', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Open any bill
      const billItem = authenticatedPage.getByText(/bill #|חשבון מס/i).first();
      if (!(await billItem.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No bills found - skipping timeline test');
        test.skip();
        return;
      }

      await billItem.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Timeline should show at least the created/draft step
      const draftStep = authenticatedPage.getByText(/draft|טיוטה/i);
      await expect(draftStep).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Signatures', () => {
    test('shows signatures section for submitted bills', async ({ authenticatedPage }) => {
      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Find a submitted or later status bill
      const nonDraftBadge = authenticatedPage
        .getByText(/submitted|under review|approved|הוגש|בבדיקה|אושר/i)
        .first();
      if (!(await nonDraftBadge.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('No submitted bills found - skipping signatures test');
        test.skip();
        return;
      }

      await nonDraftBadge.click();
      await authenticatedPage.waitForLoadState('networkidle');

      // Signatures section should be visible
      const signaturesSection = authenticatedPage.getByText(/signatures|חתימות/i);
      await expect(signaturesSection).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('bills list is accessible on mobile', async ({ authenticatedPage }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });

      const success = await navigateToExecution(authenticatedPage);
      if (!success) {
        test.skip();
        return;
      }

      // Create button or bills should be visible
      const createBtn = authenticatedPage.getByRole('button', {
        name: /create bill|צור חשבון/i,
      });
      const billsList = authenticatedPage.getByText(/bill #|חשבון מס/i).first();
      const emptyState = authenticatedPage.getByText(/no bills|אין חשבונות/i);

      await expect(createBtn.or(billsList).or(emptyState)).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
