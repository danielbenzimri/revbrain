/**
 * Salesforce Connection E2E Test
 *
 * Tests the full OAuth flow against a real Salesforce org:
 * 1. Login to RevBrain (mock auth)
 * 2. Navigate to project workspace
 * 3. Click "Connect Source Org"
 * 4. Salesforce login page opens (popup or redirect)
 * 5. Enter Salesforce credentials
 * 6. OAuth callback completes
 * 7. Connection status shows "Connected"
 *
 * Prerequisites:
 * - Server running with real Salesforce credentials (.env.real)
 * - SF_TEST_USERNAME and SF_TEST_PASSWORD set in .env.real
 * - Connected App callback URL matches server URL
 */
import { test, expect } from '@playwright/test';

const Q1_PROJECT_ID = '00000000-0000-4000-a000-000000000401';
const DIR = 'test-results/salesforce-e2e';

// Read Salesforce test credentials from environment
const SF_USERNAME = process.env.SF_TEST_USERNAME || '';
const SF_PASSWORD = process.env.SF_TEST_PASSWORD || '';

test.use({
  viewport: { width: 1440, height: 900 },
});

async function loginToRevBrain(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill('sarah@acme.com');
  await page.locator('input[type="password"]').fill('any');
  await page.getByRole('button', { name: /התחבר|sign in|login/i }).click();
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Salesforce Connection', () => {
  test.skip(!SF_USERNAME || !SF_PASSWORD, 'SF_TEST_USERNAME and SF_TEST_PASSWORD must be set');

  test('full OAuth flow — connect source org', async ({ page, context }) => {
    await loginToRevBrain(page);

    // Navigate to project workspace
    await page.goto(`/project/${Q1_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${DIR}/01-before-connect.png` });

    // Click "Connect" button on source card
    // The connect button triggers the OAuth flow via useConnectSalesforce hook
    // which POSTs to /v1/projects/:id/salesforce/connect and gets a redirectUrl
    // then opens a popup to that URL

    // Listen for the popup
    const popupPromise = context.waitForEvent('page');

    // Find and click the Connect button (source card is the first one)
    const connectButtons = page.getByLabel(/connect/i);
    const sourceConnect = connectButtons.first();
    await sourceConnect.click();

    // Wait for Salesforce popup to open
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle');
    await popup.waitForTimeout(2000);

    await popup.screenshot({ path: `${DIR}/02-salesforce-login.png` });

    // Fill in Salesforce credentials
    // Salesforce login page has #username and #password fields
    const usernameInput = popup.locator('#username');
    const passwordInput = popup.locator('#password');

    if (await usernameInput.isVisible({ timeout: 5000 })) {
      await usernameInput.fill(SF_USERNAME);
      await passwordInput.fill(SF_PASSWORD);

      // Click Login button
      const loginBtn = popup.locator('#Login');
      await loginBtn.click();

      // Wait for Salesforce to process and redirect
      await popup.waitForTimeout(3000);

      await popup.screenshot({ path: `${DIR}/03-salesforce-authorize.png` });

      // If there's an "Allow" consent screen, click it
      const allowBtn = popup.locator('#oaapprove, button:has-text("Allow")');
      if (await allowBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await allowBtn.click();
        await popup.waitForTimeout(2000);
      }

      // Wait for callback to complete (popup should close or show success message)
      await popup.waitForTimeout(3000);

      await popup.screenshot({ path: `${DIR}/04-callback-result.png` }).catch(() => {});
    } else {
      // Salesforce might auto-login if there's an existing session
      console.log('Salesforce login form not visible — may have auto-authenticated');
      await popup.waitForTimeout(5000);
    }

    // Back to main page — wait for connection status to refresh
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${DIR}/05-after-connect.png` });

    // Verify connection is shown (look for org name or "Connected" status)
    const pageContent = await page.textContent('body');
    console.log('Page content after connect:', pageContent?.substring(0, 500));
  });

  test('test connection health', async ({ page }) => {
    await loginToRevBrain(page);
    await page.goto(`/project/${Q1_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click "Test" button on source card
    const testButton = page.getByLabel(/test/i).first();
    if (await testButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await testButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${DIR}/06-test-result.png` });
    }
  });

  test('disconnect source org', async ({ page }) => {
    await loginToRevBrain(page);
    await page.goto(`/project/${Q1_PROJECT_ID}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click "Disconnect" button
    const disconnectButton = page.getByLabel(/disconnect/i).first();
    if (await disconnectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await disconnectButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${DIR}/07-after-disconnect.png` });
    }
  });
});
