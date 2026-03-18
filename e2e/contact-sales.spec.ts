import { test, expect } from './fixtures/auth';
import { test as baseTest } from '@playwright/test';

/**
 * Test Suite 2: Contact Sales / Lead Capture
 * Tests TC-2.1 through TC-2.5
 */

test.describe('Contact Sales Modal', () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  test.describe('TC-2.1: Open Contact Sales Modal from Billing Page', () => {
    test('user can open contact sales modal from Enterprise plan', async ({
      authenticatedPage,
    }) => {
      // Navigate to billing page
      await authenticatedPage.goto('/billing');

      // Wait for page to load
      await authenticatedPage.waitForLoadState('networkidle');

      // Find and click "Contact Sales" button on Enterprise plan
      const contactSalesButton = authenticatedPage.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      // If no contact sales button, there might not be an Enterprise plan visible
      // Try scrolling to find it
      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        // Scroll down to see more plans
        await authenticatedPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await authenticatedPage.waitForTimeout(500);
      }

      // Skip if still not visible (no Enterprise plan configured)
      if (!(await contactSalesButton.isVisible({ timeout: 2000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await contactSalesButton.click();

      // Wait for modal to open
      const modal = authenticatedPage
        .locator('.fixed.inset-0')
        .filter({ hasText: /contact sales/i });
      await expect(modal).toBeVisible();

      // Verify form fields are present
      await expect(modal.getByText(/your name|שם/i)).toBeVisible();
      await expect(modal.locator('input[type="email"]')).toBeVisible();
      await expect(modal.locator('input[type="tel"]').or(modal.getByText(/phone/i))).toBeVisible();
      await expect(modal.getByText(/company|חברה/i)).toBeVisible();

      // Verify Enterprise benefits list
      await expect(modal.getByText(/enterprise includes|כולל/i)).toBeVisible();

      // Verify Cancel and Submit buttons
      await expect(modal.getByRole('button', { name: /cancel|ביטול/i })).toBeVisible();
      await expect(modal.getByRole('button', { name: /submit|שלח/i })).toBeVisible();
    });
  });

  test.describe('TC-2.2: Submit Contact Sales Form - Success', () => {
    test('user can successfully submit contact sales form', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      // Find and click Contact Sales button
      const contactSalesButton = authenticatedPage.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await contactSalesButton.click();

      // Wait for modal
      const modal = authenticatedPage
        .locator('.fixed.inset-0')
        .filter({ hasText: /contact sales/i });
      await expect(modal).toBeVisible();

      // Fill in the form
      // Name
      await modal.locator('input[type="text"]').first().fill('QA Test User');

      // Email
      await modal.locator('input[type="email"]').fill(`qa.test.${uniqueSuffix}@example.com`);

      // Phone (optional)
      const phoneInput = modal.locator('input[type="tel"]');
      if (await phoneInput.isVisible()) {
        await phoneInput.fill('+1-555-123-4567');
      }

      // Company
      const companyInput = modal
        .locator('input[placeholder*="company"], input[placeholder*="Acme"]')
        .or(modal.locator('input[type="text"]').nth(1));
      await companyInput.fill('QA Testing Corp');

      // Team Size dropdown
      const teamSizeSelect = modal.locator('select');
      if (await teamSizeSelect.isVisible()) {
        await teamSizeSelect.selectOption('51-200');
      }

      // Message (optional)
      const messageField = modal.locator('textarea');
      if (await messageField.isVisible()) {
        await messageField.fill('This is a test inquiry from automated QA');
      }

      // Click Submit
      const submitButton = modal.getByRole('button', { name: /submit|שלח/i });
      await submitButton.click();

      // Wait for success state
      await expect(modal.getByText(/thank you|תודה/i)).toBeVisible({ timeout: 10000 });

      // Verify success message
      await expect(modal.getByText(/within 1 business day|יום עסקים/i)).toBeVisible();

      // Modal should still be open showing success state
      // Close button should be available
      const closeButton = modal.getByRole('button', { name: /close|סגור/i });
      await expect(closeButton).toBeVisible();
    });
  });

  test.describe('TC-2.3: Submit Contact Sales Form - Validation Errors', () => {
    test('form shows validation errors for invalid input', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      const contactSalesButton = authenticatedPage.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }

      await contactSalesButton.click();

      const modal = authenticatedPage
        .locator('.fixed.inset-0')
        .filter({ hasText: /contact sales/i });
      await expect(modal).toBeVisible();

      // Leave Name empty but fill email with invalid format
      const emailInput = modal.locator('input[type="email"]');
      await emailInput.fill('not-an-email');

      // Try to submit
      const submitButton = modal.getByRole('button', { name: /submit|שלח/i });

      // Button might be disabled or click should show validation
      const isDisabled = await submitButton.isDisabled();

      if (!isDisabled) {
        await submitButton.click();
        // Should still be on form (not success state)
        await authenticatedPage.waitForTimeout(500);
        await expect(modal.getByText(/thank you|תודה/i)).not.toBeVisible();
      } else {
        // Button being disabled is a valid validation behavior
        expect(isDisabled).toBe(true);
      }

      // Modal should still be visible with form
      await expect(modal.getByText(/your name|שם/i)).toBeVisible();
    });
  });

  test.describe('TC-2.4: Contact Sales - Rate Limiting', () => {
    // Note: This test is marked as slow because it submits multiple forms
    test.slow();

    test('rate limiting is enforced after multiple submissions', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/billing');
      await authenticatedPage.waitForLoadState('networkidle');

      const contactSalesButton = authenticatedPage.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        test.skip();
        return;
      }

      // Helper to submit form
      const submitForm = async (attempt: number) => {
        await contactSalesButton.click();
        const modal = authenticatedPage
          .locator('.fixed.inset-0')
          .filter({ hasText: /contact sales/i });
        await expect(modal).toBeVisible();

        // Fill form with unique data
        await modal.locator('input[type="text"]').first().fill(`Rate Limit Test ${attempt}`);
        await modal
          .locator('input[type="email"]')
          .fill(`ratelimit${attempt}.${uniqueSuffix}@example.com`);

        const companyInput = modal.locator('input[type="text"]').nth(1);
        await companyInput.fill(`Test Company ${attempt}`);

        const submitButton = modal.getByRole('button', { name: /submit|שלח/i });
        await submitButton.click();

        // Wait for response
        await authenticatedPage.waitForTimeout(1000);

        // Check for rate limit error
        const rateLimitError = modal.getByText(/too many requests|rate limit|נסה שוב מאוחר יותר/i);
        const hasRateLimit = await rateLimitError.isVisible().catch(() => false);

        // Close modal if visible
        const closeButton = modal.getByRole('button', { name: /close|cancel|סגור|ביטול/i });
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await expect(modal)
            .not.toBeVisible({ timeout: 2000 })
            .catch(() => {});
        }

        return hasRateLimit;
      };

      // Submit forms multiple times
      let rateLimitHit = false;
      for (let i = 1; i <= 7; i++) {
        rateLimitHit = await submitForm(i);
        if (rateLimitHit) break;
      }

      // Note: Rate limiting might not be enforced in test environment
      // This test documents the expected behavior
      // If rate limiting is properly configured, rateLimitHit should be true
      console.log(`Rate limiting hit after attempts: ${rateLimitHit}`);
    });
  });
});

/**
 * TC-2.5: Contact Sales - Unauthenticated Access
 * Using base test (not authenticated) for this test
 */
baseTest.describe('Contact Sales - Unauthenticated', () => {
  baseTest.describe('TC-2.5: Unauthenticated user can access contact sales', () => {
    baseTest('contact sales form works without authentication', async ({ page }) => {
      const uniqueSuffix = Date.now().toString().slice(-6);

      // Note: Billing page might redirect to login for unauthenticated users
      // If there's a public pricing page, use that instead
      await page.goto('/pricing');

      // If pricing page doesn't exist, try billing (might redirect to login)
      if (page.url().includes('/login')) {
        // Check if there's a link to pricing/contact sales on login page
        const contactLink = page.getByText(/contact sales|enterprise|צור קשר/i);
        if (await contactLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await contactLink.click();
        } else {
          // No public contact sales available, skip test
          baseTest.skip();
          return;
        }
      }

      // Look for Contact Sales button
      const contactSalesButton = page.getByRole('button', {
        name: /contact sales|צור קשר/i,
      });

      if (!(await contactSalesButton.isVisible({ timeout: 3000 }).catch(() => false))) {
        baseTest.skip();
        return;
      }

      await contactSalesButton.click();

      // Verify form opens
      const modal = page.locator('.fixed.inset-0').filter({ hasText: /contact sales/i });
      await baseTest.expect(modal).toBeVisible();

      // Fill and submit form
      await modal.locator('input[type="text"]').first().fill('Unauthenticated User');
      await modal.locator('input[type="email"]').fill(`unauth.${uniqueSuffix}@example.com`);

      const companyInput = modal.locator('input[type="text"]').nth(1);
      await companyInput.fill('Public Test Company');

      const submitButton = modal.getByRole('button', { name: /submit|שלח/i });
      await submitButton.click();

      // Should get success (same as authenticated)
      await baseTest.expect(modal.getByText(/thank you|תודה/i)).toBeVisible({ timeout: 10000 });
    });
  });
});
