import { test as base, expect, Page } from '@playwright/test';

/**
 * Test user credentials
 *
 * These credentials must match actual users in your test environment.
 * Set environment variables or create these users before running tests:
 *
 * Required users:
 * 1. System Admin - Has system_admin role, can access admin panel
 * 2. Regular User - Has org_admin or user role, can access billing
 *
 * Environment variables:
 * - TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD - System admin credentials
 * - TEST_USER_EMAIL, TEST_USER_PASSWORD - Regular user credentials
 *
 * Example setup (in .env.test or shell):
 * export TEST_ADMIN_EMAIL=your-admin@example.com
 * export TEST_ADMIN_PASSWORD=your-secure-password
 * export TEST_USER_EMAIL=your-user@example.com
 * export TEST_USER_PASSWORD=your-secure-password
 */
export const TEST_USERS = {
  systemAdmin: {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@revbrain.io',
    password: process.env.TEST_ADMIN_PASSWORD || 'test123456',
  },
  orgAdmin: {
    email: process.env.TEST_ORG_ADMIN_EMAIL || 'org.admin@test.com',
    password: process.env.TEST_ORG_ADMIN_PASSWORD || 'test123456',
  },
  regularUser: {
    email: process.env.TEST_USER_EMAIL || 'user@test.com',
    password: process.env.TEST_USER_PASSWORD || 'test123456',
  },
};

/**
 * Login helper function with improved error handling
 */
export async function login(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/login');

  // Wait for login page to load
  await page.waitForLoadState('networkidle');

  // Fill in credentials
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.fill(email);
  await passwordInput.fill(password);

  // Click login button
  const loginButton = page.getByRole('button', { name: /התחבר|sign in|login/i });
  await loginButton.click();

  // Wait for either navigation or error message
  try {
    // Wait up to 10 seconds for login to complete
    await Promise.race([
      // Success: navigated away from login
      expect(page).not.toHaveURL(/.*login/, { timeout: 10000 }),
      // Failure: error message appeared
      page.waitForSelector('text=/invalid|error|incorrect|שגיאה/i', { timeout: 10000 }),
    ]);

    // Check if still on login page (login failed)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      const errorMessage = await page
        .locator('text=/invalid|error|incorrect|שגיאה/i')
        .textContent()
        .catch(() => null);
      console.error(`Login failed for ${email}. Error: ${errorMessage || 'Unknown error'}`);
      console.error('Make sure test users exist and credentials are correct.');
      console.error(
        'Set TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or TEST_USER_EMAIL/TEST_USER_PASSWORD environment variables.'
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Login timeout for ${email}. Make sure the user exists in the database.`);
    return false;
  }
}

/**
 * Extended test fixture with authenticated page
 *
 * These fixtures provide pre-authenticated pages for tests.
 * Tests will fail with a clear message if login credentials are invalid.
 */
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  // A page that's logged in as a regular user
  authenticatedPage: async ({ page }, use, testInfo) => {
    const success = await login(
      page,
      TEST_USERS.regularUser.email,
      TEST_USERS.regularUser.password
    );
    if (!success) {
      // Take screenshot for debugging
      await page.screenshot({
        path: `test-results/login-failed-${testInfo.title.replace(/\s+/g, '-')}.png`,
      });
      throw new Error(
        `Failed to login as regular user (${TEST_USERS.regularUser.email}). ` +
          'Please ensure the test user exists in the database and credentials are correct. ' +
          'Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.'
      );
    }
    await use(page);
  },

  // A page that's logged in as system admin
  adminPage: async ({ page }, use, testInfo) => {
    const success = await login(
      page,
      TEST_USERS.systemAdmin.email,
      TEST_USERS.systemAdmin.password
    );
    if (!success) {
      // Take screenshot for debugging
      await page.screenshot({
        path: `test-results/login-failed-admin-${testInfo.title.replace(/\s+/g, '-')}.png`,
      });
      throw new Error(
        `Failed to login as system admin (${TEST_USERS.systemAdmin.email}). ` +
          'Please ensure the admin user exists with system_admin role in the database. ' +
          'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables.'
      );
    }
    await use(page);
  },
});

export { expect };
