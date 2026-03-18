import { test, expect } from '@playwright/test';

/**
 * Smoke Tests
 *
 * Basic tests to verify the app loads and core functionality works.
 * These run quickly and catch major breakages.
 */

test.describe('Smoke Tests', () => {
  test('homepage redirects to login when not authenticated', async ({ page }) => {
    // Go to the app root
    await page.goto('/');

    // Should redirect to login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    // Check that essential login elements are present
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Look for email input
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    await expect(emailInput).toBeVisible();

    // Look for password input
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
    await expect(passwordInput).toBeVisible();

    // Look for submit button (Hebrew: התחברי)
    const submitButton = page.getByRole('button', { name: /התחבר|sign in|login/i });
    await expect(submitButton).toBeVisible();
  });

  test('login page shows validation errors for empty form', async ({ page }) => {
    await page.goto('/login');

    // Find and click the submit button without filling the form
    const submitButton = page.getByRole('button', { name: /התחבר|sign in|login/i });
    await submitButton.click();

    // Wait a moment for validation
    await page.waitForTimeout(500);

    // Page should still be on login (not navigated away)
    await expect(page).toHaveURL(/.*login/);
  });

  test('takes a screenshot of the login page', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Take a screenshot (saved to test-results folder)
    await page.screenshot({ path: 'test-results/login-page.png', fullPage: true });
  });
});
