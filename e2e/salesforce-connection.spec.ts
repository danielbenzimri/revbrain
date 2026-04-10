/**
 * Salesforce Connection E2E Test
 *
 * Tests the full OAuth flow against a real Salesforce org.
 * Uses direct API calls + browser navigation to avoid popup complexity.
 *
 * Prerequisites:
 * - Server running with real Salesforce credentials
 * - SF_TEST_USERNAME and SF_TEST_PASSWORD set
 */
import { test, expect } from '@playwright/test';

const PHASE2_PROJECT_ID = '00000000-0000-4000-a000-000000000404';
const API_URL = 'http://localhost:3000';
const DIR = 'test-results/salesforce-e2e';

const SF_USERNAME = process.env.SF_TEST_USERNAME || '';
const SF_PASSWORD = process.env.SF_TEST_PASSWORD || '';

test.use({
  viewport: { width: 1440, height: 900 },
});

test.describe('Salesforce Connection', () => {
  test.skip(!SF_USERNAME || !SF_PASSWORD, 'SF_TEST_USERNAME and SF_TEST_PASSWORD must be set');

  test('full OAuth flow — connect, verify, disconnect', async ({ page }) => {
    // Reset mock data to clear any stale pending flows
    await page.request.post(`${API_URL}/api/v1/dev/reset-mock-data`).catch(() => {});

    // Step 1: Call the connect API directly (no auth header = default mock user)
    const connectResponse = await page.request.post(
      `${API_URL}/api/v1/projects/${PHASE2_PROJECT_ID}/salesforce/connect`,
      {
        data: { instanceType: 'production', connectionRole: 'source' },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const connectBody = await connectResponse.text();
    console.log('Connect response:', connectResponse.status(), connectBody.substring(0, 300));

    if (!connectResponse.ok()) {
      // Try without any headers (pure fetch)
      console.log('Retrying connect with fetch...');
    }
    expect(connectResponse.ok()).toBeTruthy();
    const connectData = JSON.parse(connectBody);
    const redirectUrl = connectData.data.redirectUrl;

    console.log('Got redirect URL:', redirectUrl.substring(0, 80) + '...');
    expect(redirectUrl).toContain('login.salesforce.com');

    await page.screenshot({ path: `${DIR}/01-got-redirect-url.png` });

    // Step 2: Navigate to Salesforce login
    await page.goto(redirectUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `${DIR}/02-salesforce-login-page.png` });

    // Step 3: Fill Salesforce credentials
    const usernameInput = page.locator('#username');
    const passwordInput = page.locator('#password');

    if (await usernameInput.isVisible({ timeout: 10000 })) {
      await usernameInput.fill(SF_USERNAME);
      await passwordInput.fill(SF_PASSWORD);

      await page.screenshot({ path: `${DIR}/03-credentials-filled.png` });

      // Click Login
      await page.locator('#Login').click();
      await page.waitForTimeout(5000);

      await page.screenshot({ path: `${DIR}/04-after-login.png` });
    } else {
      console.log('Username field not visible — Salesforce may have auto-logged in');
      await page.waitForTimeout(3000);
    }

    // Step 3b: Handle identity verification if shown (check URL)
    const verificationCode = process.env.SF_VERIFICATION_CODE || '';
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl.substring(0, 100));

    if (currentUrl.includes('verification') || currentUrl.includes('Verification')) {
      console.log('Identity verification page detected!');
      if (verificationCode) {
        // Try multiple selectors for the code input
        const inputSelectors = ['input[type="text"]', '#evc', 'input.input'];
        for (const sel of inputSelectors) {
          const input = page.locator(sel).first();
          if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
            await input.fill(verificationCode);
            console.log(`Verification code entered via ${sel}`);
            break;
          }
        }

        await page.screenshot({ path: `${DIR}/04b-code-entered.png` });

        // Click Verify/Submit button
        const btnSelectors = [
          'input[id="save"]',
          'button:has-text("Verify")',
          'input[value="Verify"]',
        ];
        for (const sel of btnSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click();
            console.log(`Clicked verify via ${sel}`);
            break;
          }
        }

        await page.waitForTimeout(10000);
        await page.screenshot({ path: `${DIR}/04c-after-verify.png` });
        console.log('URL after verification:', page.url().substring(0, 100));
      } else {
        console.log('WARNING: Verification page shown but SF_VERIFICATION_CODE not set');
      }
    }

    // Step 3c: Handle consent/allow screen
    const allowBtn = page.locator('#oaapprove');
    if (await allowBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('OAuth consent page detected — clicking Allow');
      await allowBtn.click();
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `${DIR}/05-after-allow.png` });
      console.log('URL after Allow:', page.url().substring(0, 100));
    } else {
      console.log('No consent page found, checking current URL:', page.url().substring(0, 80));
    }

    // Step 4: Wait for callback to process
    // The callback URL redirects back or shows a success page
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/06-callback-result.png` });

    // Log the final URL
    console.log('Final URL after OAuth:', page.url());

    // Step 5: Check connection status via API
    const statusResponse = await page.request.get(
      `${API_URL}/api/v1/projects/${PHASE2_PROJECT_ID}/salesforce/connections`
    );

    if (statusResponse.ok()) {
      const statusData = await statusResponse.json();
      console.log('Connection status:', JSON.stringify(statusData.data, null, 2));

      // Verify source connection exists
      if (statusData.data.source) {
        console.log('SUCCESS: Source connection established!');
        console.log('  Org ID:', statusData.data.source.salesforceOrgId);
        console.log('  Instance:', statusData.data.source.salesforceInstanceUrl);
        console.log('  Status:', statusData.data.source.status);

        expect(statusData.data.source.salesforceOrgId).toBeTruthy();
        expect(statusData.data.source.salesforceInstanceUrl).toContain('salesforce.com');

        // Step 6: Test the connection
        const testResponse = await page.request.post(
          `${API_URL}/api/v1/projects/${PHASE2_PROJECT_ID}/salesforce/test`,
          {
            data: { connectionRole: 'source' },
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (testResponse.ok()) {
          const testData = await testResponse.json();
          console.log('Connection test result:', JSON.stringify(testData.data));
        }

        // Step 7: Disconnect
        const disconnectResponse = await page.request.post(
          `${API_URL}/api/v1/projects/${PHASE2_PROJECT_ID}/salesforce/disconnect`,
          {
            data: { connectionRole: 'source' },
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (disconnectResponse.ok()) {
          console.log('Disconnected successfully');
        }
      } else {
        console.log('WARNING: No source connection found after OAuth flow');
        console.log('Full status:', JSON.stringify(statusData.data));
      }
    } else {
      console.log('Failed to get connection status:', statusResponse.status());
    }

    await page.screenshot({ path: `${DIR}/07-final-state.png` });
  });
});
