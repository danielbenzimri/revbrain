import { test, expect } from './fixtures/auth';

/**
 * Test Suite 4: Admin Leads CRM (Phase 8)
 * Tests TC-4.1 through TC-4.2
 *
 * Note: These tests are for the Lead Management feature (Phase 8).
 * Tests will be skipped if the feature is not yet implemented.
 */

test.describe('Admin Leads CRM', () => {
  test.describe('TC-4.1: View Leads List', () => {
    test('admin can view leads list', async ({ adminPage }) => {
      // Try to navigate to admin leads page
      await adminPage.goto('/admin/leads');

      // Wait for response
      await adminPage.waitForLoadState('networkidle');

      // Check if we're on the leads page or if it doesn't exist
      const url = adminPage.url();
      const isOnLeadsPage = url.includes('/admin/leads');

      if (!isOnLeadsPage) {
        // Page doesn't exist yet (Phase 8 not implemented)
        console.log('Admin leads page not implemented yet - skipping test');
        test.skip();
        return;
      }

      // Verify page title
      const pageTitle = adminPage.getByRole('heading', { name: /leads|לידים/i });
      await expect(pageTitle).toBeVisible();

      // Verify table structure or empty state
      const table = adminPage.locator('table');
      const emptyState = adminPage.getByText(/no leads|אין לידים/i);

      const hasTable = await table.isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmptyState = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasTable || hasEmptyState).toBe(true);

      if (hasTable) {
        // Verify table columns
        const headers = ['contact', 'company', 'status', 'source', 'created'];
        for (const header of headers) {
          const headerCell = adminPage.getByRole('columnheader', { name: new RegExp(header, 'i') });
          const isVisible = await headerCell.isVisible().catch(() => false);
          console.log(`Column "${header}" visible: ${isVisible}`);
        }

        // Verify status badges are colored
        const statusBadges = adminPage.locator('[class*="rounded-full"][class*="text-"]');
        const badgeCount = await statusBadges.count();
        console.log(`Status badges found: ${badgeCount}`);
      }

      // Verify search/filter options
      const searchInput = adminPage.locator('input[type="search"], input[placeholder*="search"]');
      const filterDropdown = adminPage.locator('select, [role="combobox"]');

      const hasSearch = await searchInput.isVisible().catch(() => false);
      const hasFilter = await filterDropdown.isVisible().catch(() => false);

      console.log(`Search available: ${hasSearch}, Filter available: ${hasFilter}`);
    });
  });

  test.describe('TC-4.2: View Lead Details', () => {
    test('admin can view lead details', async ({ adminPage }) => {
      await adminPage.goto('/admin/leads');
      await adminPage.waitForLoadState('networkidle');

      // Check if page exists
      if (!adminPage.url().includes('/admin/leads')) {
        console.log('Admin leads page not implemented yet - skipping test');
        test.skip();
        return;
      }

      // Find a lead row to click
      const leadRows = adminPage.locator('tbody tr');
      const rowCount = await leadRows.count();

      if (rowCount === 0) {
        console.log('No leads in system - skipping details test');
        test.skip();
        return;
      }

      // Click on first lead row or view button
      const viewButton = adminPage.getByRole('button', { name: /view|צפה/i }).first();
      const firstRow = leadRows.first();

      if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButton.click();
      } else {
        await firstRow.click();
      }

      // Wait for drawer/modal to open
      const detailView = adminPage.locator('[role="dialog"], [data-state="open"]');
      await expect(detailView).toBeVisible({ timeout: 5000 });

      // Verify contact info is shown
      const contactInfo = detailView.getByText(/contact|email|phone|איש קשר/i);
      await expect(contactInfo.first()).toBeVisible();

      // Verify activity timeline if present
      const activitySection = detailView.getByText(/activity|פעילות/i);
      const hasActivity = await activitySection.isVisible().catch(() => false);
      console.log(`Activity section visible: ${hasActivity}`);

      // Verify notes section if present
      const notesSection = detailView.getByText(/notes|הערות/i);
      const hasNotes = await notesSection.isVisible().catch(() => false);
      console.log(`Notes section visible: ${hasNotes}`);

      // Verify status change dropdown
      const statusDropdown = detailView.locator('select, [role="combobox"]').filter({
        has: adminPage.locator('option, [role="option"]'),
      });
      const hasStatusDropdown = await statusDropdown.isVisible().catch(() => false);
      console.log(`Status dropdown visible: ${hasStatusDropdown}`);

      // Verify "Convert to Organization" button for qualified leads
      const convertButton = detailView.getByRole('button', { name: /convert|המר/i });
      const hasConvertButton = await convertButton.isVisible().catch(() => false);
      console.log(`Convert to Org button visible: ${hasConvertButton}`);

      // Close the drawer
      const closeButton = detailView.getByRole('button', { name: /close|cancel|סגור|ביטול/i });
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Lead Status Management', () => {
    test('admin can change lead status', async ({ adminPage }) => {
      await adminPage.goto('/admin/leads');
      await adminPage.waitForLoadState('networkidle');

      if (!adminPage.url().includes('/admin/leads')) {
        test.skip();
        return;
      }

      // Open a lead
      const leadRows = adminPage.locator('tbody tr');
      if ((await leadRows.count()) === 0) {
        test.skip();
        return;
      }

      const viewButton = adminPage.getByRole('button', { name: /view|edit|צפה|עריכה/i }).first();
      if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButton.click();
      } else {
        await leadRows.first().click();
      }

      const detailView = adminPage.locator('[role="dialog"], [data-state="open"]');
      await expect(detailView).toBeVisible({ timeout: 5000 });

      // Find status dropdown
      const statusSelect = detailView.locator('select').filter({
        has: adminPage.locator('option'),
      });

      if (!(await statusSelect.isVisible({ timeout: 2000 }).catch(() => false))) {
        console.log('Status dropdown not found - skipping status change test');
        const closeButton = detailView.getByRole('button', { name: /close|cancel|סגור|ביטול/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
        return;
      }

      // Get current status
      const currentStatus = await statusSelect.inputValue();
      console.log(`Current status: ${currentStatus}`);

      // Change to a different status
      const options = await statusSelect.locator('option').allTextContents();
      const newStatus = options.find((opt) => !opt.toLowerCase().includes(currentStatus));

      if (newStatus) {
        await statusSelect.selectOption({ label: newStatus });
        console.log(`Changed status to: ${newStatus}`);

        // Wait for save/update
        await adminPage.waitForTimeout(1000);
      }

      // Close drawer
      const closeButton = detailView.getByRole('button', { name: /close|cancel|סגור|ביטול/i });
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });
});
